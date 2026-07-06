#!/usr/bin/env python3
"""
Harness Step Executor — phase 내 step을 순차 실행하고 자가 교정한다.

Usage:
    python3 scripts/execute.py <phase-dir> [--push]
"""

import argparse
import atexit
import contextlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import types
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent


@contextlib.contextmanager
def progress_indicator(label: str):
    """터미널 진행 표시기. with 문으로 사용하며 .elapsed 로 경과 시간을 읽는다."""
    frames = "◐◓◑◒"
    stop = threading.Event()
    t0 = time.monotonic()

    def _animate():
        idx = 0
        while not stop.wait(0.12):
            sec = int(time.monotonic() - t0)
            sys.stderr.write(f"\r{frames[idx % len(frames)]} {label} [{sec}s]")
            sys.stderr.flush()
            idx += 1
        sys.stderr.write("\r" + " " * (len(label) + 20) + "\r")
        sys.stderr.flush()

    th = threading.Thread(target=_animate, daemon=True)
    th.start()
    info = types.SimpleNamespace(elapsed=0.0)
    try:
        yield info
    finally:
        stop.set()
        th.join()
        info.elapsed = time.monotonic() - t0


class StepExecutor:
    """Phase 디렉토리 안의 step들을 순차 실행하는 하네스."""

    MAX_RETRIES = 3
    DEFAULT_TIMEOUT_SEC = 1800
    FEAT_MSG = "feat({phase}): step {num} — {name}"
    CHORE_MSG = "chore({phase}): step {num} output"
    TZ = timezone(timedelta(hours=9))

    def __init__(self, phase_dir_name: str, *, auto_push: bool = False,
                 allow_dirty: bool = False,
                 dry_run: bool = False,
                 from_step: Optional[int] = None,
                 max_retries: Optional[int] = None,
                 timeout: Optional[int] = None,
                 verbose: bool = False,
                 max_cost_usd: float = 20.0):
        self._root = str(ROOT)
        self._phases_dir = ROOT / "phases"
        self._phase_dir = self._phases_dir / phase_dir_name
        self._phase_dir_name = phase_dir_name
        self._top_index_file = self._phases_dir / "index.json"
        self._auto_push = auto_push
        self._allow_dirty = allow_dirty
        self._dry_run = dry_run
        self._from_step = from_step
        self._max_retries = max_retries if max_retries is not None else self.MAX_RETRIES
        self._timeout = timeout if timeout is not None else self.DEFAULT_TIMEOUT_SEC
        self._verbose = verbose
        self._max_cost_usd = max_cost_usd
        self._lock_held = False

        if not self._phase_dir.is_dir():
            print(f"ERROR: {self._phase_dir} not found")
            sys.exit(1)

        self._index_file = self._phase_dir / "index.json"
        if not self._index_file.exists():
            print(f"ERROR: {self._index_file} not found")
            sys.exit(1)

        idx = self._read_json(self._index_file)
        self._project = idx.get("project", "project")
        self._phase_name = idx.get("phase", phase_dir_name)
        self._total = len(idx["steps"])

    def _validate_phase_index(self) -> None:
        """Validate phase index.json is well-formed JSON before doing anything."""
        try:
            with open(self._index_file, encoding="utf-8") as f:
                json.load(f)
        except json.JSONDecodeError as e:
            print(f"[ERROR] {self._index_file} JSON 파싱 실패: {e}", file=sys.stderr)
            print("[HINT]  python3 -m json.tool로 확인 후 수정하세요.", file=sys.stderr)
            sys.exit(1)
        except FileNotFoundError:
            pass  # _load_index() will handle this with a better error

    def run(self):
        self._validate_phase_index()
        self._print_header()
        self._ensure_claude_cli()
        if self._dry_run:
            self._log_event("run", "dry_run", phase=self._phase_name)
        else:
            self._log_event("run", "start", phase=self._phase_name, total=self._total)
            self._install_signal_handlers()
            self._acquire_lock()
            self._log_event("run", "lock_acquired", pid=os.getpid())
        self._check_clean_tree()
        if self._from_step is not None:
            self._reset_from_step(self._from_step)
        self._check_blockers()
        if not self._dry_run:
            self._checkout_branch()
        guardrails = self._load_guardrails()
        self._log(f"guardrails loaded: {len(guardrails)} chars")
        if not self._dry_run:
            self._ensure_created_at()
        self._execute_all_steps(guardrails)
        if not self._dry_run:
            self._finalize()

    # --- timestamps ---

    def _stamp(self) -> str:
        return datetime.now(self.TZ).strftime("%Y-%m-%dT%H:%M:%S%z")

    # --- JSON I/O ---

    @staticmethod
    def _read_json(p: Path) -> dict:
        return json.loads(p.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(p: Path, data: dict):
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- git ---

    def _run_git(self, *args) -> subprocess.CompletedProcess:
        cmd = ["git"] + list(args)
        r = subprocess.run(cmd, cwd=self._root, capture_output=True, text=True)
        if self._verbose and r.stderr.strip():
            self._log(f"git {args[0]} stderr: {r.stderr.strip()[:200]}")
        return r

    def _checkout_branch(self):
        branch = f"feat-{self._phase_name}"

        r = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        if r.returncode != 0:
            print(f"  ERROR: git을 사용할 수 없거나 git repo가 아닙니다.")
            print(f"  {r.stderr.strip()}")
            sys.exit(1)

        if r.stdout.strip() == branch:
            return

        r = self._run_git("rev-parse", "--verify", branch)
        r = self._run_git("checkout", branch) if r.returncode == 0 else self._run_git("checkout", "-b", branch)

        if r.returncode != 0:
            print(f"  ERROR: 브랜치 '{branch}' checkout 실패.")
            print(f"  {r.stderr.strip()}")
            print(f"  Hint: 변경사항을 stash하거나 commit한 후 다시 시도하세요.")
            sys.exit(1)

        print(f"  Branch: {branch}")

    def _commit_step(self, step_num: int, step_name: str):
        phase_rel = f"phases/{self._phase_dir_name}"
        output_rel = f"{phase_rel}/step{step_num}-output.json"
        index_rel = f"{phase_rel}/index.json"
        lock_rel = f"{phase_rel}/.lock"
        runlog_rel = f"{phase_rel}/run.log"

        self._run_git("add", "-A")
        self._run_git("reset", "HEAD", "--", output_rel)
        self._run_git("reset", "HEAD", "--", index_rel)
        self._run_git("reset", "HEAD", "--", lock_rel)
        self._run_git("reset", "HEAD", "--", runlog_rel)
        # attempt 파일 모두 제외
        for attempt_file in self._phase_dir.glob(f"step{step_num}-output-attempt*.json"):
            rel = f"{phase_rel}/{attempt_file.name}"
            self._run_git("reset", "HEAD", "--", rel)

        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.FEAT_MSG.format(phase=self._phase_name, num=step_num, name=step_name)
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  Commit: {msg}")
            else:
                print(f"  WARN: 코드 커밋 실패: {r.stderr.strip()}")

        self._run_git("add", "-A")
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.CHORE_MSG.format(phase=self._phase_name, num=step_num)
            r = self._run_git("commit", "-m", msg)
            if r.returncode != 0:
                print(f"  WARN: housekeeping 커밋 실패: {r.stderr.strip()}")

    # --- top-level index ---

    def _update_top_index(self, status: str):
        if not self._top_index_file.exists():
            return
        top = self._read_json(self._top_index_file)
        ts = self._stamp()

        # Reconcile "completed" status: if any step is not completed, use "partial" instead
        if status == "completed" and self._index_file.exists():
            phase_index = self._read_json(self._index_file)
            incomplete = [
                s for s in phase_index.get("steps", [])
                if s.get("status") not in ("completed",)
            ]
            if incomplete:
                status = "partial"
                print(f"[WARN] phase {self._phase_name}: {len(incomplete)}개 스텝 미완료 → status=partial")

        for phase in top.get("phases", []):
            if phase.get("dir") == self._phase_dir_name:
                phase["status"] = status
                ts_key = {"completed": "completed_at", "partial": "completed_at",
                          "error": "failed_at", "blocked": "blocked_at"}.get(status)
                if ts_key:
                    phase[ts_key] = ts
                break
        self._write_json(self._top_index_file, top)

    # --- guardrails & context ---

    def _load_guardrails(self) -> str:
        sections = []
        claude_md = ROOT / "CLAUDE.md"
        if claude_md.exists():
            sections.append(f"## 프로젝트 규칙 (CLAUDE.md)\n\n{claude_md.read_text()}")
        docs_dir = ROOT / "docs"
        if docs_dir.is_dir():
            for doc in sorted(docs_dir.glob("*.md")):
                sections.append(f"## {doc.stem}\n\n{doc.read_text()}")
        return "\n\n---\n\n".join(sections) if sections else ""

    @staticmethod
    def _build_step_context(index: dict) -> str:
        lines = [
            f"- Step {s['step']} ({s['name']}): {s['summary']}"
            for s in index["steps"]
            if s["status"] == "completed" and s.get("summary")
        ]
        if not lines:
            return ""
        return "## 이전 Step 산출물\n\n" + "\n".join(lines) + "\n\n"

    def _build_preamble(self, guardrails: str, step_context: str,
                        prev_error: Optional[str] = None) -> str:
        commit_example = self.FEAT_MSG.format(
            phase=self._phase_name, num="N", name="<step-name>"
        )
        retry_section = ""
        if prev_error:
            retry_section = (
                f"\n## ⚠ 이전 시도 실패 — 아래 에러를 반드시 참고하여 수정하라\n\n"
                f"{prev_error}\n\n---\n\n"
            )
        return (
            f"당신은 {self._project} 프로젝트의 개발자입니다. 아래 step을 수행하세요.\n\n"
            f"{guardrails}\n\n---\n\n"
            f"{step_context}{retry_section}"
            f"## 작업 규칙\n\n"
            f"1. 이전 step에서 작성된 코드를 확인하고 일관성을 유지하라.\n"
            f"2. 이 step에 명시된 작업만 수행하라. 추가 기능이나 파일을 만들지 마라.\n"
            f"3. 기존 테스트를 깨뜨리지 마라.\n"
            f"4. AC(Acceptance Criteria) 검증을 직접 실행하라.\n"
            f"5. /phases/{self._phase_dir_name}/index.json의 해당 step status를 업데이트하라:\n"
            f"   - AC 통과 → \"completed\" + \"summary\" 필드에 이 step의 산출물을 한 줄로 요약\n"
            f"   - {self._max_retries}회 수정 시도 후에도 실패 → \"error\" + \"error_message\" 기록\n"
            f"   - 사용자 개입이 필요한 경우 (API 키, 인증, 수동 설정 등) → \"blocked\" + \"blocked_reason\" 기록 후 즉시 중단\n"
            f"6. 모든 변경사항을 커밋하라:\n"
            f"   {commit_example}\n\n---\n\n"
        )

    # --- Claude 호출 ---

    def _invoke_claude(self, step: dict, preamble: str, attempt: int = 1) -> dict:
        step_num, step_name = step["step"], step["name"]
        step_file = self._phase_dir / f"step{step_num}.md"

        if not step_file.exists():
            print(f"  ERROR: {step_file} not found")
            sys.exit(1)

        prompt = preamble + step_file.read_text()
        self._log(f"step {step_num} prompt size: {len(prompt)} chars (attempt {attempt})")

        if self._dry_run:
            print(f"\n=== DRY RUN: step {step_num} ({step_name}) ===")
            print(f"--- guardrails (len: {len(preamble)} chars) ---")
            print(preamble)
            print(f"--- step {step_num} ---")
            print(step_file.read_text())
            print(f"=== END step {step_num} ===\n")
            return {
                "step": step_num, "name": step_name,
                "exitCode": 0, "stdout": "", "stderr": "[dry-run]",
            }

        legacy_path = self._phase_dir / f"step{step_num}-output.json"
        attempt_path = self._phase_dir / f"step{step_num}-output-attempt{attempt}.json"

        try:
            result = subprocess.run(
                ["claude", "-p", "--dangerously-skip-permissions", "--output-format", "json", prompt],
                cwd=self._root, capture_output=True, text=True, timeout=self._timeout,
            )
        except subprocess.TimeoutExpired as e:
            stdout = e.stdout if isinstance(e.stdout, str) else (
                (e.stdout or b"").decode("utf-8", errors="replace")
            )
            output = {
                "step": step_num, "name": step_name,
                "exitCode": -1, "timeout": True,
                "stdout": stdout, "stderr": f"[timeout after {self._timeout}s]",
            }
            self._write_output(output, attempt_path, legacy_path)
            self._log_event(f"step {step_num}", "timeout", attempt=attempt, seconds=self._timeout)
            print(f"\n  WARN: Claude timeout after {self._timeout}s — retry path 진입")
            return output

        if result.returncode != 0:
            print(f"\n  WARN: Claude가 비정상 종료됨 (code {result.returncode})")
            if result.stderr:
                print(f"  stderr: {result.stderr[:500]}")

        output = {
            "step": step_num, "name": step_name,
            "exitCode": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr,
        }

        # claude --output-format json stdout 파싱 (best-effort)
        if result.stdout:
            try:
                parsed = json.loads(result.stdout)
            except (json.JSONDecodeError, ValueError):
                parsed = None
            if isinstance(parsed, dict):
                output["claude_session_id"] = parsed.get("session_id")
                output["claude_total_cost_usd"] = parsed.get("total_cost_usd")
                output["claude_is_error"] = parsed.get("is_error", False)
                output["claude_num_turns"] = parsed.get("num_turns")

        self._write_output(output, attempt_path, legacy_path)

        return output

    def _write_output(self, output: dict, attempt_path: Path, legacy_path: Path) -> None:
        """attempt 별 + legacy step{N}-output.json 둘 다 저장."""
        payload = json.dumps(output, indent=2, ensure_ascii=False)
        attempt_path.write_text(payload, encoding="utf-8")
        legacy_path.write_text(payload, encoding="utf-8")

    # --- 관측: run.log / attempt 메트릭 ---

    def _log_event(self, scope: str, event: str, **fields) -> None:
        """phases/<phase>/run.log 에 한 줄 append. dry-run 은 minimal logging."""
        if self._dry_run and event != "dry_run":
            return
        path = self._phase_dir / "run.log"
        parts = [self._stamp(), f"[{scope}]", event]
        for k, v in fields.items():
            parts.append(f"{k}={v}")
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(" ".join(str(p) for p in parts) + "\n")
        except OSError:
            pass  # 로깅 실패는 silent — 본 흐름을 막지 않는다

    def _append_attempt_record(self, step_num: int, attempt: int, elapsed: int,
                                output: dict) -> None:
        """index.json 의 step 객체에 attempts[] 기록 누적."""
        index = self._read_json(self._index_file)
        record = {
            "attempt": attempt,
            "elapsed_sec": elapsed,
            "exit_code": output.get("exitCode"),
        }
        if output.get("timeout"):
            record["timeout"] = True
        if "claude_total_cost_usd" in output and output["claude_total_cost_usd"] is not None:
            record["cost_usd"] = output["claude_total_cost_usd"]
        if "claude_session_id" in output and output["claude_session_id"]:
            record["session_id"] = output["claude_session_id"]
        for s in index["steps"]:
            if s["step"] == step_num:
                s.setdefault("attempts", []).append(record)
                break
        self._write_json(self._index_file, index)

    # --- UX: claude CLI / from-step / verbose ---

    def _log(self, msg: str) -> None:
        """verbose 모드에서만 stderr 에 [DEBUG] prefix 로 출력."""
        if self._verbose:
            print(f"[DEBUG] {msg}", file=sys.stderr)

    def _ensure_claude_cli(self) -> None:
        """shutil.which('claude') 검사. 없으면 친절한 안내 후 exit 1.
        --dry-run 시 skip (실제 호출 없음).
        """
        if self._dry_run:
            return
        if shutil.which("claude") is not None:
            return
        print("ERROR: 'claude' CLI 를 PATH 에서 찾을 수 없습니다.")
        print("")
        print("       설치 방법: https://docs.anthropic.com/en/docs/claude-code")
        print("       PATH 확인: command -v claude")
        print("")
        print("       --dry-run 모드는 'claude' 없이도 프롬프트 검증 가능합니다.")
        sys.exit(1)

    def _reset_from_step(self, n: int) -> None:
        """step N 이상의 모든 step 을 pending 으로 리셋. timestamps/messages/summary/attempts 모두 제거."""
        index = self._read_json(self._index_file)
        steps = index["steps"]
        if n < 0 or n >= len(steps):
            print(f"ERROR: --from-step {n} out of range (steps 0..{len(steps)-1})")
            sys.exit(1)
        cleared = 0
        for s in steps:
            if s["step"] >= n:
                s["status"] = "pending"
                for key in ("started_at", "completed_at", "failed_at", "blocked_at",
                            "error_message", "blocked_reason", "summary", "attempts"):
                    s.pop(key, None)
                cleared += 1
        self._write_json(self._index_file, index)
        print(f"  Reset steps >= {n} (count: {cleared})")

    # --- 안전성: dirty-tree / lock / signals ---

    def _check_clean_tree(self) -> None:
        """phase 디렉토리와 phases/index.json 외부의 미커밋 변경이 있으면 abort.

        phase 디렉토리 안의 step.md / .lock / output JSON / run.log / index.json 변경은
        정상 흐름의 일부이므로 무시한다. phases/index.json 도 새 task 등록 직후라 자주
        untracked 상태이므로 무시.
        """
        r = self._run_git("status", "--porcelain")
        if r.returncode != 0:
            print(f"  WARN: git status 호출 실패 — clean 검사 skip: {r.stderr.strip()}")
            return

        phase_prefix = f"phases/{self._phase_dir_name}/"
        ignored_exact = {"phases/index.json"}
        offenders: list[str] = []
        for line in r.stdout.splitlines():
            # porcelain 형식: "XY path" (X/Y는 status code, path 는 스페이스 1 개 후)
            if len(line) < 4:
                continue
            path = line[3:].strip()
            # rename 표기 "old -> new" 처리
            if " -> " in path:
                path = path.split(" -> ", 1)[1]
            # 따옴표 처리
            if path.startswith('"') and path.endswith('"'):
                path = path[1:-1]
            if path.startswith(phase_prefix) or path in ignored_exact:
                continue
            offenders.append(path)

        if not offenders:
            return

        if self._allow_dirty:
            print(f"  WARN: --allow-dirty — {len(offenders)} dirty path(s) 무시")
            return

        print("ERROR: 작업트리에 phase 디렉토리 외 미커밋 변경이 있습니다.")
        print("       무시하려면 --allow-dirty 를 사용하세요.")
        print("       변경 목록:")
        for path in offenders[:10]:
            print(f"         {path}")
        if len(offenders) > 10:
            print(f"         ... (+{len(offenders) - 10} more)")
        sys.exit(1)

    def _lock_path(self) -> Path:
        return self._phase_dir / ".lock"

    def _acquire_lock(self) -> None:
        """phases/{phase}/.lock 을 atomic 생성. 살아있는 PID 면 abort, 죽은 PID 면 회수."""
        path = self._lock_path()
        payload = {
            "pid": os.getpid(),
            "started_at": self._stamp(),
            "host": self._safe_hostname(),
        }
        try:
            fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            # 이미 존재 — 살아있는지 검사
            stale_reason = self._lock_is_stale(path)
            if stale_reason is None:
                # live
                try:
                    info = json.loads(path.read_text())
                except (json.JSONDecodeError, OSError):
                    info = {}
                print(f"ERROR: 다른 인스턴스가 이미 이 phase 를 실행 중입니다.")
                print(f"       lock: {path}")
                if info:
                    print(f"       pid={info.get('pid')} started_at={info.get('started_at')} host={info.get('host')}")
                print(f"       강제 진행하려면 lock 파일을 직접 제거하세요: rm {path}")
                sys.exit(1)
            # stale
            print(f"  WARN: stale lock 회수 ({stale_reason})")
            try:
                path.unlink()
            except OSError as e:
                print(f"  ERROR: stale lock 제거 실패: {e}")
                sys.exit(1)
            try:
                fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except OSError as e:
                print(f"  ERROR: lock 재생성 실패: {e}")
                sys.exit(1)

        try:
            os.write(fd, json.dumps(payload, ensure_ascii=False).encode("utf-8"))
        finally:
            os.close(fd)

        self._lock_held = True
        atexit.register(self._release_lock)

    def _release_lock(self) -> None:
        """lock 파일 삭제. 부재 또는 비소유 시 silent."""
        if not self._lock_held:
            return
        try:
            self._lock_path().unlink()
        except FileNotFoundError:
            pass
        except OSError:
            pass
        self._lock_held = False

    @staticmethod
    def _lock_is_stale(path: Path) -> Optional[str]:
        """살아있는 PID 가 든 lock 이면 None, stale 이면 사유 문자열 반환."""
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            return "corrupt JSON"
        pid = data.get("pid")
        if not isinstance(pid, int):
            return "missing pid"
        if pid == os.getpid():
            return "own pid (self-restart)"
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return f"dead pid {pid}"
        except PermissionError:
            # 다른 사용자의 살아있는 프로세스 — stale 아님
            return None
        except OSError as e:
            return f"kill probe failed: {e}"
        return None

    @staticmethod
    def _safe_hostname() -> str:
        try:
            return socket.gethostname() or "unknown"
        except OSError:
            return "unknown"

    def _install_signal_handlers(self) -> None:
        """SIGINT/SIGTERM 시 lock 해제 + 130 exit. progress thread 는 데몬이므로 자연 종료."""
        def _handler(signum, frame):  # noqa: ARG001
            self._release_lock()
            print("\n  Interrupted — released lock", file=sys.stderr)
            sys.exit(130)
        try:
            signal.signal(signal.SIGINT, _handler)
            signal.signal(signal.SIGTERM, _handler)
        except (ValueError, OSError):
            # 메인 스레드가 아니거나 환경이 시그널을 지원하지 않으면 silent skip
            pass

    # --- 헤더 & 검증 ---

    def _print_header(self):
        print(f"\n{'='*60}")
        print(f"  Harness Step Executor")
        print(f"  Phase: {self._phase_name} | Steps: {self._total}")
        if self._auto_push:
            print(f"  Auto-push: enabled")
        print(f"{'='*60}")

    def _check_blockers(self):
        """마지막 non-pending step 의 status 를 검사한다.

        정상 실행 흐름에서는 error/blocked 이면 즉시 sys.exit 하므로 그 이후 step 이
        completed 가 되는 일이 없다. 따라서 reverse 순회로 마지막 non-pending step 만
        보면 충분.

        Note: 사용자가 수동으로 중간 step 을 error/blocked 로 두고 그 이후 step 을
        completed 로 바꾼 케이스는 검출하지 않는다. 그런 상태는 정상 흐름에서
        만들어지지 않는다.
        """
        index = self._read_json(self._index_file)
        for s in reversed(index["steps"]):
            if s["status"] == "error":
                print(f"\n  ✗ Step {s['step']} ({s['name']}) failed.")
                print(f"  Error: {s.get('error_message', 'unknown')}")
                print(f"  Fix and reset status to 'pending' to retry.")
                sys.exit(1)
            if s["status"] == "blocked":
                print(f"\n  ⏸ Step {s['step']} ({s['name']}) blocked.")
                print(f"  Reason: {s.get('blocked_reason', 'unknown')}")
                print(f"  Resolve and reset status to 'pending' to retry.")
                sys.exit(2)
            if s["status"] != "pending":
                break

    def _ensure_created_at(self):
        index = self._read_json(self._index_file)
        if "created_at" not in index:
            index["created_at"] = self._stamp()
            self._write_json(self._index_file, index)

    # --- 실행 루프 ---

    def _execute_single_step(self, step: dict, guardrails: str) -> bool:
        """단일 step 실행 (재시도 포함). 완료되면 True, 실패/차단이면 False."""
        step_num, step_name = step["step"], step["name"]
        done = sum(1 for s in self._read_json(self._index_file)["steps"] if s["status"] == "completed")
        prev_error = None

        self._log_event(f"step {step_num}", "start", name=step_name)

        for attempt in range(1, self._max_retries + 1):
            index = self._read_json(self._index_file)
            step_context = self._build_step_context(index)
            preamble = self._build_preamble(guardrails, step_context, prev_error)

            tag = f"Step {step_num}/{self._total - 1} ({done} done): {step_name}"
            if attempt > 1:
                tag += f" [retry {attempt}/{self._max_retries}]"
                self._log_event(f"step {step_num}", "retry", attempt=attempt,
                                prev_error_len=len(prev_error or ""))

            with progress_indicator(tag) as pi:
                output = self._invoke_claude(step, preamble, attempt=attempt)
                elapsed = int(pi.elapsed)

            # dry-run: status 검사·index 갱신·commit 모두 skip
            if self._dry_run:
                print(f"  [dry-run] Step {step_num}: {step_name} prompt 생성 완료 [{elapsed}s]")
                return True

            # attempt 메트릭 누적
            self._append_attempt_record(step_num, attempt, elapsed, output)

            # 누적 비용 상한 검사
            total_cost = sum(
                a.get("cost_usd", 0.0)
                for s in self._read_json(self._index_file).get("steps", [])
                for a in s.get("attempts", [])
            )
            if total_cost >= self._max_cost_usd:
                print(f"[WARN] 누적 비용 ${total_cost:.2f} — 상한 ${self._max_cost_usd:.2f} 도달. 이후 스텝 blocked 처리.")
                sys.exit(3)  # distinct exit code for cost ceiling

            index = self._read_json(self._index_file)
            status = next((s.get("status", "pending") for s in index["steps"] if s["step"] == step_num), "pending")
            ts = self._stamp()

            # claude_is_error 가 True 면 status 가 completed 라도 강제 error 분기
            if status == "completed" and output.get("claude_is_error"):
                status = "error"
                # error_message 가 비어있으면 채워준다
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "error"
                        s.setdefault("error_message", "claude_is_error=true 응답")
                self._write_json(self._index_file, index)

            if status == "completed":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["completed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                self._log_event(f"step {step_num}", "completed",
                                elapsed=elapsed, attempt=attempt)
                print(f"  ✓ Step {step_num}: {step_name} [{elapsed}s]")
                return True

            if status == "blocked":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["blocked_at"] = ts
                self._write_json(self._index_file, index)
                reason = next((s.get("blocked_reason", "") for s in index["steps"] if s["step"] == step_num), "")
                self._log_event(f"step {step_num}", "blocked", elapsed=elapsed)
                print(f"  ⏸ Step {step_num}: {step_name} blocked [{elapsed}s]")
                print(f"    Reason: {reason}")
                self._update_top_index("blocked")
                sys.exit(2)

            err_msg = next(
                (s.get("error_message", "Step did not update status") for s in index["steps"] if s["step"] == step_num),
                "Step did not update status",
            )

            if attempt < self._max_retries:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "pending"
                        s.pop("error_message", None)
                self._write_json(self._index_file, index)
                prev_error = err_msg
                print(f"  ↻ Step {step_num}: retry {attempt}/{self._max_retries} — {err_msg}")
            else:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "error"
                        s["error_message"] = f"[{self._max_retries}회 시도 후 실패] {err_msg}"
                        s["failed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                self._log_event(f"step {step_num}", "error",
                                attempts=self._max_retries, elapsed=elapsed)
                print(f"  ✗ Step {step_num}: {step_name} failed after {self._max_retries} attempts [{elapsed}s]")
                print(f"    Error: {err_msg}")
                self._update_top_index("error")
                sys.exit(1)

        return False  # unreachable

    def _execute_all_steps(self, guardrails: str):
        # dry-run: 모든 pending step 의 프롬프트만 출력
        if self._dry_run:
            index = self._read_json(self._index_file)
            for pending in [s for s in index["steps"] if s["status"] == "pending"]:
                self._execute_single_step(pending, guardrails)
            return

        while True:
            index = self._read_json(self._index_file)
            pending = next((s for s in index["steps"] if s["status"] == "pending"), None)
            if pending is None:
                print("\n  All steps completed!")
                return

            step_num = pending["step"]
            for s in index["steps"]:
                if s["step"] == step_num and "started_at" not in s:
                    s["started_at"] = self._stamp()
                    self._write_json(self._index_file, index)
                    break

            self._execute_single_step(pending, guardrails)

    def _finalize(self):
        index = self._read_json(self._index_file)
        index["completed_at"] = self._stamp()
        self._write_json(self._index_file, index)
        self._update_top_index("completed")

        self._run_git("add", "-A")
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = f"chore({self._phase_name}): mark phase completed"
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  ✓ {msg}")

        if self._auto_push:
            branch = f"feat-{self._phase_name}"
            r = self._run_git("push", "-u", "origin", branch)
            if r.returncode != 0:
                print(f"\n  ERROR: git push 실패: {r.stderr.strip()}")
                sys.exit(1)
            print(f"  ✓ Pushed to origin/{branch}")

        self._log_event("run", "release_lock")
        self._release_lock()
        self._log_event("run", "finalized")

        print(f"\n{'='*60}")
        print(f"  Phase '{self._phase_name}' completed!")
        print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Harness Step Executor")
    parser.add_argument("phase_dir", help="Phase directory name (e.g. 0-mvp)")
    parser.add_argument("--push", action="store_true", help="Push branch after completion")
    parser.add_argument("--allow-dirty", action="store_true",
                        help="작업트리 dirty 검사 우회 (위험 — 사용자 미커밋 파일이 우발 커밋될 수 있음)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Claude 호출 없이 프롬프트만 stdout 출력. git/index 변경 없음.")
    parser.add_argument("--from-step", type=int, metavar="N", default=None,
                        help="step N 부터 실행. N 이상의 step status/타임스탬프 모두 리셋.")
    parser.add_argument("--max-retries", type=int, default=None, metavar="N",
                        help=f"step 당 최대 재시도. 기본 {StepExecutor.MAX_RETRIES}.")
    parser.add_argument("--timeout", type=int, default=None, metavar="SEC",
                        help=f"Claude 호출 타임아웃. 기본 {StepExecutor.DEFAULT_TIMEOUT_SEC} 초.")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="프롬프트 길이, git stderr, 내부 분기를 stderr 로 출력.")
    parser.add_argument("--max-cost-usd", type=float, default=20.0,
                        metavar="USD",
                        help="Phase 전체 누적 비용 상한 (기본 $20.00). 초과 시 다음 스텝 blocked 처리.")
    args = parser.parse_args()

    # 상호 배타 검증
    if args.dry_run and args.push:
        print("ERROR: --dry-run 은 commit 자체가 없어 push 할 게 없습니다.", file=sys.stderr)
        sys.exit(1)

    StepExecutor(
        args.phase_dir,
        auto_push=args.push,
        allow_dirty=args.allow_dirty,
        dry_run=args.dry_run,
        from_step=args.from_step,
        max_retries=args.max_retries,
        timeout=args.timeout,
        verbose=args.verbose,
        max_cost_usd=args.max_cost_usd,
    ).run()


if __name__ == "__main__":
    main()
