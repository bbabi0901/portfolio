"""
execute.py 리팩터링 안전망 테스트.
리팩터링 전후 동작이 동일한지 검증한다.
"""

import json
import os
import subprocess
import sys
import textwrap
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import execute as ex


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_project(tmp_path):
    """phases/, CLAUDE.md, docs/ 를 갖춘 임시 프로젝트 구조."""
    phases_dir = tmp_path / "phases"
    phases_dir.mkdir()

    claude_md = tmp_path / "CLAUDE.md"
    claude_md.write_text("# Rules\n- rule one\n- rule two")

    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "arch.md").write_text("# Architecture\nSome content")
    (docs_dir / "guide.md").write_text("# Guide\nAnother doc")

    return tmp_path


@pytest.fixture
def phase_dir(tmp_project):
    """step 3개를 가진 phase 디렉토리."""
    d = tmp_project / "phases" / "0-mvp"
    d.mkdir()

    index = {
        "project": "TestProject",
        "phase": "mvp",
        "steps": [
            {"step": 0, "name": "setup", "status": "completed", "summary": "프로젝트 초기화 완료"},
            {"step": 1, "name": "core", "status": "completed", "summary": "핵심 로직 구현"},
            {"step": 2, "name": "ui", "status": "pending"},
        ],
    }
    (d / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False))
    (d / "step2.md").write_text("# Step 2: UI\n\nUI를 구현하세요.")

    return d


@pytest.fixture
def top_index(tmp_project):
    """phases/index.json (top-level)."""
    top = {
        "phases": [
            {"dir": "0-mvp", "status": "pending"},
            {"dir": "1-polish", "status": "pending"},
        ]
    }
    p = tmp_project / "phases" / "index.json"
    p.write_text(json.dumps(top, indent=2))
    return p


@pytest.fixture
def executor(tmp_project, phase_dir):
    """테스트용 StepExecutor 인스턴스. git 호출은 별도 mock 필요."""
    with patch.object(ex, "ROOT", tmp_project):
        inst = ex.StepExecutor("0-mvp")
    # 내부 경로를 tmp_project 기준으로 재설정
    inst._root = str(tmp_project)
    inst._phases_dir = tmp_project / "phases"
    inst._phase_dir = phase_dir
    inst._phase_dir_name = "0-mvp"
    inst._index_file = phase_dir / "index.json"
    inst._top_index_file = tmp_project / "phases" / "index.json"
    return inst


# ---------------------------------------------------------------------------
# _stamp (= 이전 now_iso)
# ---------------------------------------------------------------------------

class TestStamp:
    def test_returns_kst_timestamp(self, executor):
        result = executor._stamp()
        assert "+0900" in result

    def test_format_is_iso(self, executor):
        result = executor._stamp()
        dt = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert dt.tzinfo is not None

    def test_is_current_time(self, executor):
        before = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0)
        result = executor._stamp()
        after = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0) + timedelta(seconds=1)
        parsed = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert before <= parsed <= after


# ---------------------------------------------------------------------------
# _read_json / _write_json
# ---------------------------------------------------------------------------

class TestJsonHelpers:
    def test_roundtrip(self, tmp_path):
        data = {"key": "값", "nested": [1, 2, 3]}
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, data)
        loaded = ex.StepExecutor._read_json(p)
        assert loaded == data

    def test_save_ensures_ascii_false(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"한글": "테스트"})
        raw = p.read_text()
        assert "한글" in raw
        assert "\\u" not in raw

    def test_save_indented(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"a": 1})
        raw = p.read_text()
        assert "\n" in raw

    def test_load_nonexistent_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            ex.StepExecutor._read_json(tmp_path / "nope.json")


# ---------------------------------------------------------------------------
# _load_guardrails
# ---------------------------------------------------------------------------

class TestLoadGuardrails:
    def test_loads_claude_md_and_docs(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "# Rules" in result
        assert "rule one" in result
        assert "# Architecture" in result
        assert "# Guide" in result

    def test_sections_separated_by_divider(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "---" in result

    def test_docs_sorted_alphabetically(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        arch_pos = result.index("arch")
        guide_pos = result.index("guide")
        assert arch_pos < guide_pos

    def test_no_claude_md(self, executor, tmp_project):
        (tmp_project / "CLAUDE.md").unlink()
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "CLAUDE.md" not in result
        assert "Architecture" in result

    def test_no_docs_dir(self, executor, tmp_project):
        import shutil
        shutil.rmtree(tmp_project / "docs")
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "Rules" in result
        assert "Architecture" not in result

    def test_empty_project(self, tmp_path):
        with patch.object(ex, "ROOT", tmp_path):
            # executor가 필요 없는 static-like 동작이므로 임시 인스턴스
            phases_dir = tmp_path / "phases" / "dummy"
            phases_dir.mkdir(parents=True)
            idx = {"project": "T", "phase": "t", "steps": []}
            (phases_dir / "index.json").write_text(json.dumps(idx))
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
            result = inst._load_guardrails()
        assert result == ""


# ---------------------------------------------------------------------------
# _build_step_context
# ---------------------------------------------------------------------------

class TestBuildStepContext:
    def test_includes_completed_with_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert "Step 0 (setup): 프로젝트 초기화 완료" in result
        assert "Step 1 (core): 핵심 로직 구현" in result

    def test_excludes_pending(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert "ui" not in result

    def test_excludes_completed_without_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        del index["steps"][0]["summary"]
        result = ex.StepExecutor._build_step_context(index)
        assert "setup" not in result
        assert "core" in result

    def test_empty_when_no_completed(self):
        index = {"steps": [{"step": 0, "name": "a", "status": "pending"}]}
        result = ex.StepExecutor._build_step_context(index)
        assert result == ""

    def test_has_header(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert result.startswith("## 이전 Step 산출물")


# ---------------------------------------------------------------------------
# _build_preamble
# ---------------------------------------------------------------------------

class TestBuildPreamble:
    def test_includes_project_name(self, executor):
        result = executor._build_preamble("", "")
        assert "TestProject" in result

    def test_includes_guardrails(self, executor):
        result = executor._build_preamble("GUARD_CONTENT", "")
        assert "GUARD_CONTENT" in result

    def test_includes_step_context(self, executor):
        ctx = "## 이전 Step 산출물\n\n- Step 0: done"
        result = executor._build_preamble("", ctx)
        assert "이전 Step 산출물" in result

    def test_includes_commit_example(self, executor):
        result = executor._build_preamble("", "")
        assert "feat(mvp):" in result

    def test_includes_rules(self, executor):
        result = executor._build_preamble("", "")
        assert "작업 규칙" in result
        assert "AC" in result

    def test_no_retry_section_by_default(self, executor):
        result = executor._build_preamble("", "")
        assert "이전 시도 실패" not in result

    def test_retry_section_with_prev_error(self, executor):
        result = executor._build_preamble("", "", prev_error="타입 에러 발생")
        assert "이전 시도 실패" in result
        assert "타입 에러 발생" in result

    def test_includes_max_retries(self, executor):
        result = executor._build_preamble("", "")
        assert str(ex.StepExecutor.MAX_RETRIES) in result

    def test_includes_index_path(self, executor):
        result = executor._build_preamble("", "")
        assert "/phases/0-mvp/index.json" in result


# ---------------------------------------------------------------------------
# _update_top_index
# ---------------------------------------------------------------------------

class TestUpdateTopIndex:
    def test_completed(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "completed"
        assert "completed_at" in mvp

    def test_error(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("error")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "error"
        assert "failed_at" in mvp

    def test_blocked(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("blocked")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "blocked"
        assert "blocked_at" in mvp

    def test_other_phases_unchanged(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text())
        polish = next(p for p in data["phases"] if p["dir"] == "1-polish")
        assert polish["status"] == "pending"

    def test_nonexistent_dir_is_noop(self, executor, top_index):
        executor._top_index_file = top_index
        executor._phase_dir_name = "no-such-dir"
        original = json.loads(top_index.read_text())
        executor._update_top_index("completed")
        after = json.loads(top_index.read_text())
        for p_before, p_after in zip(original["phases"], after["phases"]):
            assert p_before["status"] == p_after["status"]

    def test_no_top_index_file(self, executor, tmp_path):
        executor._top_index_file = tmp_path / "nonexistent.json"
        executor._update_top_index("completed")  # should not raise


# ---------------------------------------------------------------------------
# _checkout_branch (mocked)
# ---------------------------------------------------------------------------

class TestCheckoutBranch:
    def _mock_git(self, executor, responses):
        call_idx = {"i": 0}
        def fake_git(*args):
            idx = call_idx["i"]
            call_idx["i"] += 1
            if idx < len(responses):
                return responses[idx]
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

    def test_already_on_branch(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="feat-mvp\n", stderr=""),
        ])
        executor._checkout_branch()  # should return without checkout

    def test_branch_exists_checkout(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_branch_not_exists_create(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="not found"),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_checkout_fails_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="dirty tree"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1

    def test_no_git_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=1, stdout="", stderr="not a git repo"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _commit_step (mocked)
# ---------------------------------------------------------------------------

class TestCommitStep:
    def test_two_phase_commit(self, executor):
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_calls = [c for c in calls if c[0] == "commit"]
        assert len(commit_calls) == 2
        assert "feat(mvp):" in commit_calls[0][2]
        assert "chore(mvp):" in commit_calls[1][2]

    def test_no_code_changes_skips_feat_commit(self, executor):
        call_count = {"diff": 0}
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                call_count["diff"] += 1
                if call_count["diff"] == 1:
                    return MagicMock(returncode=0)
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_msgs = [c[2] for c in calls if c[0] == "commit"]
        assert len(commit_msgs) == 1
        assert "chore" in commit_msgs[0]


# ---------------------------------------------------------------------------
# _invoke_claude (mocked)
# ---------------------------------------------------------------------------

class TestInvokeClaude:
    def test_invokes_claude_with_correct_args(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"result": "ok"}', stderr="")
        step = {"step": 2, "name": "ui"}
        preamble = "PREAMBLE\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            output = executor._invoke_claude(step, preamble)

        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "claude"
        assert "-p" in cmd
        assert "--dangerously-skip-permissions" in cmd
        assert "--output-format" in cmd
        assert "PREAMBLE" in cmd[-1]
        assert "UI를 구현하세요" in cmd[-1]

    def test_saves_output_json(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"ok": true}', stderr="")
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", return_value=mock_result):
            executor._invoke_claude(step, "preamble")

        output_file = executor._phase_dir / "step2-output.json"
        assert output_file.exists()
        data = json.loads(output_file.read_text())
        assert data["step"] == 2
        assert data["name"] == "ui"
        assert data["exitCode"] == 0

    def test_nonexistent_step_file_exits(self, executor):
        step = {"step": 99, "name": "nonexistent"}
        with pytest.raises(SystemExit) as exc_info:
            executor._invoke_claude(step, "preamble")
        assert exc_info.value.code == 1

    def test_timeout_is_1800(self, executor):
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_claude(step, "preamble")

        assert mock_run.call_args[1]["timeout"] == 1800


# ---------------------------------------------------------------------------
# progress_indicator (= 이전 Spinner)
# ---------------------------------------------------------------------------

class TestProgressIndicator:
    def test_context_manager(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.15)
        assert pi.elapsed >= 0.1

    def test_elapsed_increases(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.2)
        assert pi.elapsed > 0


# ---------------------------------------------------------------------------
# main() CLI 파싱 (mocked)
# ---------------------------------------------------------------------------

class TestMainCli:
    def test_no_args_exits(self):
        with patch("sys.argv", ["execute.py"]):
            with pytest.raises(SystemExit) as exc_info:
                ex.main()
            assert exc_info.value.code == 2  # argparse exits with 2

    def test_invalid_phase_dir_exits(self):
        with patch("sys.argv", ["execute.py", "nonexistent"]):
            with patch.object(ex, "ROOT", Path("/tmp/fake_nonexistent")):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1

    def test_missing_index_exits(self, tmp_project):
        (tmp_project / "phases" / "empty").mkdir()
        with patch("sys.argv", ["execute.py", "empty"]):
            with patch.object(ex, "ROOT", tmp_project):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _check_blockers (= 이전 main() error/blocked 체크)
# ---------------------------------------------------------------------------

class TestCheckBlockers:
    def _make_executor_with_steps(self, tmp_project, steps):
        d = tmp_project / "phases" / "test-phase"
        d.mkdir(exist_ok=True)
        index = {"project": "T", "phase": "test", "steps": steps}
        (d / "index.json").write_text(json.dumps(index))

        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
        inst._root = str(tmp_project)
        inst._phases_dir = tmp_project / "phases"
        inst._phase_dir = d
        inst._phase_dir_name = "test-phase"
        inst._index_file = d / "index.json"
        inst._top_index_file = tmp_project / "phases" / "index.json"
        inst._phase_name = "test"
        inst._total = len(steps)
        return inst

    def test_error_step_exits_1(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "bad", "status": "error", "error_message": "fail"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 1

    def test_blocked_step_exits_2(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "stuck", "status": "blocked", "blocked_reason": "API key"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 2


# ---------------------------------------------------------------------------
# Step 1 — _check_clean_tree (dirty-tree guard)
# ---------------------------------------------------------------------------

class TestCheckCleanTree:
    def _mock_porcelain(self, executor, output: str, returncode: int = 0):
        def fake_git(*args):
            if args[0] == "status" and "--porcelain" in args:
                return MagicMock(returncode=returncode, stdout=output, stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

    def test_clean_tree_passes(self, executor):
        self._mock_porcelain(executor, "")
        executor._check_clean_tree()  # 예외 없음

    def test_phase_dir_changes_ignored(self, executor):
        self._mock_porcelain(executor,
            "?? phases/0-mvp/step3.md\n M phases/0-mvp/index.json\n")
        executor._check_clean_tree()  # 예외 없음

    def test_phases_index_json_change_ignored(self, executor):
        self._mock_porcelain(executor, " M phases/index.json\n")
        executor._check_clean_tree()  # 예외 없음

    def test_unrelated_dirty_aborts(self, executor, capsys):
        self._mock_porcelain(executor, " M src/foo.ts\n?? scripts/extra.py\n")
        with pytest.raises(SystemExit) as exc:
            executor._check_clean_tree()
        assert exc.value.code == 1
        captured = capsys.readouterr()
        assert "phase 디렉토리 외 미커밋 변경" in captured.out
        assert "src/foo.ts" in captured.out
        assert "scripts/extra.py" in captured.out
        assert "--allow-dirty" in captured.out

    def test_allow_dirty_skips(self, executor, capsys):
        executor._allow_dirty = True
        self._mock_porcelain(executor, " M src/foo.ts\n")
        executor._check_clean_tree()  # 예외 없음
        captured = capsys.readouterr()
        assert "WARN" in captured.out

    def test_rename_target_path_evaluated(self, executor, capsys):
        # rename 표기 — 새 path 가 phase 외부면 abort
        self._mock_porcelain(executor, "R  phases/0-mvp/old.md -> src/new.ts\n")
        with pytest.raises(SystemExit):
            executor._check_clean_tree()

    def test_quoted_path_handled(self, executor):
        # 따옴표로 감싼 path — phase 디렉토리면 무시
        self._mock_porcelain(executor, '?? "phases/0-mvp/step 3.md"\n')
        executor._check_clean_tree()  # 예외 없음

    def test_git_status_failure_skips_check(self, executor, capsys):
        self._mock_porcelain(executor, "", returncode=1)
        executor._check_clean_tree()  # 예외 없음
        captured = capsys.readouterr()
        assert "WARN" in captured.out


# ---------------------------------------------------------------------------
# Step 1 — _invoke_claude timeout 예외 처리
# ---------------------------------------------------------------------------

class TestTimeoutHandling:
    def _setup(self, executor, exception):
        # step2.md 파일은 fixture에서 이미 생성되어 있음
        with patch("subprocess.run", side_effect=exception) as mock_run:
            output = executor._invoke_claude({"step": 2, "name": "ui"}, "preamble")
        return output, mock_run

    def test_timeout_returns_dict_with_timeout_field(self, executor):
        exc = subprocess.TimeoutExpired(cmd=["claude"], timeout=1800, output="partial-out")
        output, _ = self._setup(executor, exc)
        assert output["timeout"] is True

    def test_timeout_records_exitcode_minus1(self, executor):
        exc = subprocess.TimeoutExpired(cmd=["claude"], timeout=1800)
        output, _ = self._setup(executor, exc)
        assert output["exitCode"] == -1
        assert "timeout after 1800s" in output["stderr"]

    def test_timeout_writes_output_json(self, executor, phase_dir):
        exc = subprocess.TimeoutExpired(cmd=["claude"], timeout=1800)
        self._setup(executor, exc)
        out_file = phase_dir / "step2-output.json"
        assert out_file.exists()
        data = json.loads(out_file.read_text())
        assert data["timeout"] is True
        assert data["exitCode"] == -1

    def test_timeout_with_bytes_stdout(self, executor):
        exc = subprocess.TimeoutExpired(
            cmd=["claude"], timeout=1800, output=b"bytes-out"
        )
        output, _ = self._setup(executor, exc)
        assert "bytes-out" in output["stdout"]

    def test_normal_run_unaffected(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"ok":true}', stderr="")
        with patch("subprocess.run", return_value=mock_result):
            output = executor._invoke_claude({"step": 2, "name": "ui"}, "preamble")
        assert output["exitCode"] == 0
        assert "timeout" not in output


# ---------------------------------------------------------------------------
# Step 1 — _acquire_lock / _release_lock / _lock_is_stale
# ---------------------------------------------------------------------------

class TestLock:
    def test_acquire_creates_lock_file(self, executor, phase_dir):
        executor._acquire_lock()
        try:
            lock = phase_dir / ".lock"
            assert lock.exists()
            assert executor._lock_held is True
        finally:
            executor._release_lock()

    def test_acquire_writes_pid_and_timestamp(self, executor, phase_dir):
        executor._acquire_lock()
        try:
            data = json.loads((phase_dir / ".lock").read_text())
            assert data["pid"] == os.getpid()
            assert "+0900" in data["started_at"]
            assert data["host"]
        finally:
            executor._release_lock()

    def test_acquire_aborts_when_live_pid(self, executor, phase_dir, monkeypatch, capsys):
        # 다른 PID (자기 자신이 아님) 가 살아있는 것처럼 시뮬레이션
        (phase_dir / ".lock").write_text(json.dumps({
            "pid": 99999, "started_at": "2026-05-06T00:00:00+0900", "host": "h"
        }))
        # 어떤 PID 든 살아있다고 응답
        monkeypatch.setattr(ex.os, "kill", lambda pid, sig: None)
        with pytest.raises(SystemExit) as exc:
            executor._acquire_lock()
        assert exc.value.code == 1
        captured = capsys.readouterr()
        assert "이미 이 phase 를 실행 중" in captured.out
        assert "99999" in captured.out

    def test_acquire_recovers_when_dead_pid(self, executor, phase_dir, monkeypatch, capsys):
        (phase_dir / ".lock").write_text(json.dumps({
            "pid": 99999, "started_at": "2026-05-06T00:00:00+0900", "host": "h"
        }))
        def fake_kill(pid, sig):
            raise ProcessLookupError()
        monkeypatch.setattr(ex.os, "kill", fake_kill)
        executor._acquire_lock()
        try:
            data = json.loads((phase_dir / ".lock").read_text())
            assert data["pid"] == os.getpid()
            captured = capsys.readouterr()
            assert "stale lock 회수" in captured.out
        finally:
            executor._release_lock()

    def test_acquire_recovers_when_corrupt_json(self, executor, phase_dir, capsys):
        (phase_dir / ".lock").write_text("not json {{{")
        executor._acquire_lock()
        try:
            data = json.loads((phase_dir / ".lock").read_text())
            assert data["pid"] == os.getpid()
            captured = capsys.readouterr()
            assert "stale lock 회수" in captured.out
            assert "corrupt JSON" in captured.out
        finally:
            executor._release_lock()

    def test_acquire_recovers_own_pid(self, executor, phase_dir, capsys):
        # 자기 자신의 PID — self-restart 로 간주, 회수
        (phase_dir / ".lock").write_text(json.dumps({
            "pid": os.getpid(), "started_at": "2026-05-06T00:00:00+0900", "host": "h"
        }))
        executor._acquire_lock()
        try:
            captured = capsys.readouterr()
            assert "self-restart" in captured.out
        finally:
            executor._release_lock()

    def test_release_removes_lock(self, executor, phase_dir):
        executor._acquire_lock()
        executor._release_lock()
        assert not (phase_dir / ".lock").exists()
        assert executor._lock_held is False

    def test_release_silent_when_absent(self, executor):
        # lock 미획득 상태에서 release 호출 — 예외 없이 통과
        executor._release_lock()  # 예외 없음

    def test_release_silent_when_file_disappeared(self, executor, phase_dir):
        executor._acquire_lock()
        (phase_dir / ".lock").unlink()  # 외부에서 삭제됐다고 가정
        executor._release_lock()  # FileNotFoundError 안 던짐


# ---------------------------------------------------------------------------
# Step 1 — _install_signal_handlers
# ---------------------------------------------------------------------------

class TestSignalHandlers:
    def test_install_does_not_raise(self, executor):
        executor._install_signal_handlers()  # 예외 없음

    def test_handler_releases_lock_and_exits_130(self, executor, phase_dir, monkeypatch):
        executor._acquire_lock()
        # signal.signal 을 가로채서 핸들러 함수만 캡처
        captured = {}
        def fake_signal(signum, handler):
            captured[signum] = handler
        monkeypatch.setattr(ex.signal, "signal", fake_signal)

        executor._install_signal_handlers()
        # 핸들러 호출 — exit 130
        with pytest.raises(SystemExit) as exc:
            captured[ex.signal.SIGINT](ex.signal.SIGINT, None)
        assert exc.value.code == 130
        # lock 해제 확인
        assert not (phase_dir / ".lock").exists()


# ---------------------------------------------------------------------------
# Step 1 — _commit_step lock 제외
# ---------------------------------------------------------------------------

class TestCommitExcludesLock:
    def test_lock_excluded_from_commit(self, executor):
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        executor._commit_step(2, "ui")
        reset_calls = [c for c in calls if c[:2] == ("reset", "HEAD")]
        reset_paths = [c[-1] for c in reset_calls]
        assert any(".lock" in p for p in reset_paths), f"lock not in reset list: {reset_paths}"


# ---------------------------------------------------------------------------
# Step 2 — --dry-run 동작
# ---------------------------------------------------------------------------

class TestDryRun:
    def test_dry_run_skips_subprocess(self, executor, capsys):
        executor._dry_run = True
        with patch("subprocess.run") as mock_run:
            executor._invoke_claude({"step": 2, "name": "ui"}, "PRE\n")
        mock_run.assert_not_called()
        out = capsys.readouterr().out
        assert "DRY RUN" in out
        assert "step 2" in out

    def test_dry_run_does_not_write_output_json(self, executor, phase_dir):
        executor._dry_run = True
        executor._invoke_claude({"step": 2, "name": "ui"}, "preamble")
        assert not (phase_dir / "step2-output.json").exists()

    def test_dry_run_does_not_modify_index(self, executor, phase_dir):
        executor._dry_run = True
        before = (phase_dir / "index.json").read_text()
        executor._execute_single_step({"step": 2, "name": "ui"}, "guardrails")
        after = (phase_dir / "index.json").read_text()
        assert before == after

    def test_dry_run_with_push_errors_in_main(self, capsys):
        with patch("sys.argv", ["execute.py", "0-mvp", "--dry-run", "--push"]):
            with pytest.raises(SystemExit) as exc:
                ex.main()
        assert exc.value.code == 1
        assert "dry-run" in capsys.readouterr().err

    def test_dry_run_skips_lock_acquisition(self, executor, phase_dir, monkeypatch):
        executor._dry_run = True
        # subprocess.run, _run_git, _ensure_created_at, _checkout_branch 모두 mock
        monkeypatch.setattr(executor, "_run_git",
                            lambda *a: MagicMock(returncode=0, stdout="", stderr=""))
        monkeypatch.setattr(executor, "_check_clean_tree", lambda: None)
        # 두 번 run() 호출해도 lock 충돌 없어야 함
        executor.run()
        # phase_dir/.lock 파일이 생성되지 않았음을 확인
        assert not (phase_dir / ".lock").exists()


# ---------------------------------------------------------------------------
# Step 2 — --from-step
# ---------------------------------------------------------------------------

class TestFromStep:
    def test_from_step_resets_n_and_after(self, executor, phase_dir):
        # 기본 fixture: step 0,1=completed, step 2=pending
        executor._reset_from_step(1)
        idx = json.loads((phase_dir / "index.json").read_text())
        assert idx["steps"][0]["status"] == "completed"
        assert idx["steps"][1]["status"] == "pending"
        assert idx["steps"][2]["status"] == "pending"

    def test_from_step_clears_timestamps_and_messages(self, executor, phase_dir):
        # step 1 에 추가 필드 주입
        idx = json.loads((phase_dir / "index.json").read_text())
        idx["steps"][1].update({
            "started_at": "2026-05-06T00:00:00+0900",
            "completed_at": "2026-05-06T01:00:00+0900",
            "summary": "old summary",
            "error_message": "old error",
        })
        (phase_dir / "index.json").write_text(json.dumps(idx))

        executor._reset_from_step(1)
        idx2 = json.loads((phase_dir / "index.json").read_text())
        for key in ("started_at", "completed_at", "summary", "error_message"):
            assert key not in idx2["steps"][1]

    def test_from_step_preserves_before_n(self, executor, phase_dir):
        executor._reset_from_step(2)
        idx = json.loads((phase_dir / "index.json").read_text())
        assert idx["steps"][0]["status"] == "completed"
        assert idx["steps"][0]["summary"] == "프로젝트 초기화 완료"
        assert idx["steps"][1]["status"] == "completed"

    def test_from_step_out_of_range_errors(self, executor, capsys):
        with pytest.raises(SystemExit) as exc:
            executor._reset_from_step(99)
        assert exc.value.code == 1
        assert "out of range" in capsys.readouterr().out

    def test_from_step_negative_errors(self, executor):
        with pytest.raises(SystemExit):
            executor._reset_from_step(-1)


# ---------------------------------------------------------------------------
# Step 2 — --max-retries / --timeout
# ---------------------------------------------------------------------------

class TestRetryAndTimeoutFlags:
    def test_max_retries_flag_applied(self, tmp_project, phase_dir):
        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor("0-mvp", max_retries=7)
        inst._phase_dir = phase_dir
        inst._index_file = phase_dir / "index.json"
        assert inst._max_retries == 7

    def test_max_retries_fallback_to_class_constant(self, tmp_project, phase_dir):
        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor("0-mvp")
        assert inst._max_retries == ex.StepExecutor.MAX_RETRIES

    def test_timeout_flag_applied(self, tmp_project, phase_dir):
        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor("0-mvp", timeout=600)
        assert inst._timeout == 600

    def test_timeout_fallback_to_default(self, tmp_project, phase_dir):
        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor("0-mvp")
        assert inst._timeout == ex.StepExecutor.DEFAULT_TIMEOUT_SEC == 1800

    def test_timeout_passed_to_subprocess(self, executor):
        executor._timeout = 99
        mock_result = MagicMock(returncode=0, stdout='{"ok":true}', stderr="")
        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_claude({"step": 2, "name": "ui"}, "preamble")
        assert mock_run.call_args[1]["timeout"] == 99


# ---------------------------------------------------------------------------
# Step 2 — _ensure_claude_cli
# ---------------------------------------------------------------------------

class TestEnsureClaudeCli:
    def test_missing_cli_exits(self, executor, monkeypatch, capsys):
        monkeypatch.setattr(ex.shutil, "which", lambda name: None)
        with pytest.raises(SystemExit) as exc:
            executor._ensure_claude_cli()
        assert exc.value.code == 1
        out = capsys.readouterr().out
        assert "claude" in out
        assert "PATH" in out

    def test_present_cli_passes(self, executor, monkeypatch):
        monkeypatch.setattr(ex.shutil, "which", lambda name: "/usr/bin/claude")
        executor._ensure_claude_cli()  # 예외 없음

    def test_dry_run_skips_check(self, executor, monkeypatch):
        executor._dry_run = True
        monkeypatch.setattr(ex.shutil, "which", lambda name: None)  # 부재여도 OK
        executor._ensure_claude_cli()  # 예외 없음


# ---------------------------------------------------------------------------
# Step 2 — --verbose
# ---------------------------------------------------------------------------

class TestVerbose:
    def test_verbose_off_silent(self, executor, capsys):
        executor._verbose = False
        executor._log("test message")
        assert capsys.readouterr().err == ""

    def test_verbose_on_prints_debug(self, executor, capsys):
        executor._verbose = True
        executor._log("hello world")
        err = capsys.readouterr().err
        assert "[DEBUG]" in err
        assert "hello world" in err

    def test_verbose_logs_git_stderr(self, executor, capsys):
        executor._verbose = True
        # _run_git 직접 호출 — subprocess.run mock
        mock_result = MagicMock(returncode=0, stdout="", stderr="some warning")
        with patch("subprocess.run", return_value=mock_result):
            executor._run_git("status")
        err = capsys.readouterr().err
        assert "git status stderr" in err
        assert "some warning" in err


# ---------------------------------------------------------------------------
# Step 3 — Attempt별 output 보존
# ---------------------------------------------------------------------------

class TestAttemptOutputs:
    def test_attempt_files_accumulate(self, executor, phase_dir):
        # 두 attempt 시뮬레이션 — subprocess.run 이 두 번 호출됨
        results = [
            MagicMock(returncode=1, stdout="", stderr="first fail"),
            MagicMock(returncode=0, stdout='{"ok":true}', stderr=""),
        ]
        with patch("subprocess.run", side_effect=results):
            executor._invoke_claude({"step": 2, "name": "ui"}, "p1", attempt=1)
            executor._invoke_claude({"step": 2, "name": "ui"}, "p2", attempt=2)
        assert (phase_dir / "step2-output-attempt1.json").exists()
        assert (phase_dir / "step2-output-attempt2.json").exists()
        # 내용이 다른지 확인 (덮어쓰기 안 됨)
        a1 = json.loads((phase_dir / "step2-output-attempt1.json").read_text())
        a2 = json.loads((phase_dir / "step2-output-attempt2.json").read_text())
        assert a1["exitCode"] == 1
        assert a2["exitCode"] == 0

    def test_legacy_output_json_mirrors_last(self, executor, phase_dir):
        results = [
            MagicMock(returncode=1, stdout="", stderr="fail"),
            MagicMock(returncode=0, stdout='{"ok":true}', stderr=""),
        ]
        with patch("subprocess.run", side_effect=results):
            executor._invoke_claude({"step": 2, "name": "ui"}, "p1", attempt=1)
            executor._invoke_claude({"step": 2, "name": "ui"}, "p2", attempt=2)
        legacy = json.loads((phase_dir / "step2-output.json").read_text())
        assert legacy["exitCode"] == 0  # 마지막 attempt 와 동일

    def test_attempt_files_excluded_from_commit(self, executor, phase_dir):
        # attempt 파일이 존재하면 reset 목록에 추가되어야 함
        (phase_dir / "step2-output-attempt1.json").write_text("{}")
        (phase_dir / "step2-output-attempt2.json").write_text("{}")
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        executor._commit_step(2, "ui")
        reset_paths = [c[-1] for c in calls if c[:2] == ("reset", "HEAD")]
        assert any("attempt1" in p for p in reset_paths), reset_paths
        assert any("attempt2" in p for p in reset_paths), reset_paths
        assert any("run.log" in p for p in reset_paths), reset_paths


# ---------------------------------------------------------------------------
# Step 3 — Phase run.log
# ---------------------------------------------------------------------------

class TestRunLog:
    def test_log_event_appends_line(self, executor, phase_dir):
        executor._log_event("run", "start", phase="test", total=3)
        path = phase_dir / "run.log"
        assert path.exists()
        content = path.read_text()
        assert "[run]" in content
        assert "start" in content
        assert "phase=test" in content
        assert "total=3" in content

    def test_log_event_format_includes_kst_timestamp(self, executor, phase_dir):
        executor._log_event("step 0", "completed", elapsed=5)
        line = (phase_dir / "run.log").read_text().strip()
        assert "+0900" in line
        assert "[step 0]" in line
        assert "completed" in line

    def test_log_event_appends_multiple_lines(self, executor, phase_dir):
        executor._log_event("run", "start")
        executor._log_event("step 0", "completed")
        executor._log_event("run", "finalized")
        lines = (phase_dir / "run.log").read_text().splitlines()
        assert len(lines) == 3

    def test_dry_run_minimal_logging(self, executor, phase_dir):
        executor._dry_run = True
        executor._log_event("run", "start")  # dry-run 이라 미기록
        executor._log_event("run", "dry_run")  # dry_run 이벤트는 기록
        executor._log_event("step 0", "completed")  # dry-run 이라 미기록
        path = phase_dir / "run.log"
        if path.exists():
            content = path.read_text()
            assert "start" not in content
            assert "completed" not in content
            assert "dry_run" in content


# ---------------------------------------------------------------------------
# Step 3 — claude --output-format json 파싱
# ---------------------------------------------------------------------------

class TestClaudeResultParse:
    def _invoke(self, executor, stdout: str):
        mock_result = MagicMock(returncode=0, stdout=stdout, stderr="")
        with patch("subprocess.run", return_value=mock_result):
            return executor._invoke_claude({"step": 2, "name": "ui"}, "preamble")

    def test_parses_valid_json_stdout(self, executor):
        out = self._invoke(executor, json.dumps({
            "session_id": "abc123", "total_cost_usd": 0.5,
            "is_error": False, "num_turns": 4,
        }))
        assert out["claude_session_id"] == "abc123"
        assert out["claude_total_cost_usd"] == 0.5
        assert out["claude_is_error"] is False
        assert out["claude_num_turns"] == 4

    def test_handles_invalid_json_silently(self, executor):
        out = self._invoke(executor, "not json {{{")
        assert "claude_session_id" not in out  # 파싱 실패 — 필드 미생성

    def test_handles_empty_stdout(self, executor):
        out = self._invoke(executor, "")
        assert "claude_session_id" not in out

    def test_handles_non_dict_json(self, executor):
        # Claude 가 배열을 출력해도 raise 하지 않음
        out = self._invoke(executor, "[1,2,3]")
        assert "claude_session_id" not in out

    def test_records_session_id_and_cost(self, executor, phase_dir):
        self._invoke(executor, json.dumps({
            "session_id": "s1", "total_cost_usd": 0.123,
        }))
        out_file = json.loads((phase_dir / "step2-output.json").read_text())
        assert out_file["claude_session_id"] == "s1"
        assert out_file["claude_total_cost_usd"] == 0.123

    def test_is_error_overrides_completed_status(self, executor, phase_dir):
        # step 2 status 를 completed 로 미리 마킹
        idx = json.loads((phase_dir / "index.json").read_text())
        idx["steps"][2]["status"] = "completed"
        (phase_dir / "index.json").write_text(json.dumps(idx))
        executor._run_git = lambda *a: MagicMock(returncode=0, stdout="", stderr="")
        executor._max_retries = 1   # 단일 attempt 로 force-error 분기 검증
        mock_result = MagicMock(returncode=0,
                                 stdout=json.dumps({"is_error": True}),
                                 stderr="")
        with patch("subprocess.run", return_value=mock_result):
            with pytest.raises(SystemExit):
                executor._execute_single_step({"step": 2, "name": "ui"}, "G")
        idx2 = json.loads((phase_dir / "index.json").read_text())
        assert idx2["steps"][2]["status"] == "error"
        # max_retries=1 의 final-error 분기에서 메시지가 wrap 됨 — 원본 force-error 메시지 보존
        assert "claude_is_error" in idx2["steps"][2]["error_message"]


# ---------------------------------------------------------------------------
# Step 3 — attempts 메트릭
# ---------------------------------------------------------------------------

class TestAttemptsMetric:
    def test_attempts_appended_per_attempt(self, executor, phase_dir):
        executor._append_attempt_record(2, 1, 30, {
            "exitCode": 0, "claude_total_cost_usd": 0.1, "claude_session_id": "s1",
        })
        idx = json.loads((phase_dir / "index.json").read_text())
        attempts = idx["steps"][2]["attempts"]
        assert len(attempts) == 1
        assert attempts[0]["attempt"] == 1
        assert attempts[0]["elapsed_sec"] == 30
        assert attempts[0]["cost_usd"] == 0.1
        assert attempts[0]["session_id"] == "s1"

    def test_attempts_persist_across_calls(self, executor, phase_dir):
        executor._append_attempt_record(2, 1, 10, {"exitCode": 1})
        executor._append_attempt_record(2, 2, 20, {"exitCode": 0})
        idx = json.loads((phase_dir / "index.json").read_text())
        attempts = idx["steps"][2]["attempts"]
        assert len(attempts) == 2
        assert attempts[0]["attempt"] == 1
        assert attempts[1]["attempt"] == 2

    def test_attempt_records_timeout(self, executor, phase_dir):
        executor._append_attempt_record(2, 1, 1800, {
            "exitCode": -1, "timeout": True,
        })
        idx = json.loads((phase_dir / "index.json").read_text())
        assert idx["steps"][2]["attempts"][0]["timeout"] is True


# ---------------------------------------------------------------------------
# Step 5 — 미커버 영역 보강
# ---------------------------------------------------------------------------

class TestEnsureCreatedAt:
    def test_writes_when_absent(self, executor, phase_dir):
        idx = json.loads((phase_dir / "index.json").read_text())
        assert "created_at" not in idx
        executor._ensure_created_at()
        idx2 = json.loads((phase_dir / "index.json").read_text())
        assert "created_at" in idx2
        assert "+0900" in idx2["created_at"]

    def test_idempotent_when_present(self, executor, phase_dir):
        executor._ensure_created_at()
        first = json.loads((phase_dir / "index.json").read_text())["created_at"]
        executor._ensure_created_at()  # 두 번째 호출
        second = json.loads((phase_dir / "index.json").read_text())["created_at"]
        assert first == second  # 변경 없음


class TestPrintHeader:
    def test_prints_phase_and_total(self, executor, capsys):
        executor._print_header()
        out = capsys.readouterr().out
        assert "Harness Step Executor" in out
        assert executor._phase_name in out

    def test_shows_auto_push_when_enabled(self, executor, capsys):
        executor._auto_push = True
        executor._print_header()
        out = capsys.readouterr().out
        assert "Auto-push" in out


class TestExecuteSingleStepBranches:
    """_execute_single_step 의 completed/blocked/error/retry 분기 통합."""

    def _setup_step(self, executor, phase_dir, target_status: str,
                    error_msg: str = "", reason: str = ""):
        """mock_subprocess 가 호출되면 step 의 status 를 target_status 로 갱신."""
        idx_path = phase_dir / "index.json"

        def fake_run(*args, **kwargs):
            idx = json.loads(idx_path.read_text())
            for s in idx["steps"]:
                if s["step"] == 2:
                    s["status"] = target_status
                    if target_status == "error" and error_msg:
                        s["error_message"] = error_msg
                    if target_status == "blocked" and reason:
                        s["blocked_reason"] = reason
            idx_path.write_text(json.dumps(idx))
            return MagicMock(returncode=0, stdout='{"ok":true}', stderr="")

        executor._run_git = lambda *a: MagicMock(returncode=0, stdout="", stderr="")
        return fake_run

    def test_completed_returns_true(self, executor, phase_dir):
        fake_run = self._setup_step(executor, phase_dir, "completed")
        with patch("subprocess.run", side_effect=fake_run):
            result = executor._execute_single_step({"step": 2, "name": "ui"}, "G")
        assert result is True
        idx = json.loads((phase_dir / "index.json").read_text())
        assert "completed_at" in idx["steps"][2]

    def test_blocked_exits_2(self, executor, phase_dir):
        fake_run = self._setup_step(executor, phase_dir, "blocked", reason="API key needed")
        with patch("subprocess.run", side_effect=fake_run):
            with pytest.raises(SystemExit) as exc:
                executor._execute_single_step({"step": 2, "name": "ui"}, "G")
        assert exc.value.code == 2
        idx = json.loads((phase_dir / "index.json").read_text())
        assert "blocked_at" in idx["steps"][2]

    def test_error_after_max_retries_exits_1(self, executor, phase_dir, capsys):
        executor._max_retries = 2
        # 매번 'pending' 으로 두면 status 갱신 안된 것 = retry
        # 결국 max_retries 후 error 분기로 가야 함
        executor._run_git = lambda *a: MagicMock(returncode=0, stdout="", stderr="")
        with patch("subprocess.run", return_value=MagicMock(returncode=0, stdout='{"ok":true}', stderr="")):
            with pytest.raises(SystemExit) as exc:
                executor._execute_single_step({"step": 2, "name": "ui"}, "G")
        assert exc.value.code == 1
        idx = json.loads((phase_dir / "index.json").read_text())
        assert idx["steps"][2]["status"] == "error"
        assert "failed_at" in idx["steps"][2]
        assert "2회 시도 후 실패" in idx["steps"][2]["error_message"]


class TestExecuteAllSteps:
    def test_runs_only_pending(self, executor, phase_dir):
        # fixture: step 0,1 = completed, step 2 = pending
        called = []
        def fake_single(step, *_a):
            called.append(step["step"])
            # 호출 후 pending → completed 로 갱신
            idx = json.loads((phase_dir / "index.json").read_text())
            for s in idx["steps"]:
                if s["step"] == step["step"]:
                    s["status"] = "completed"
                    s["summary"] = "done"
            (phase_dir / "index.json").write_text(json.dumps(idx))
            return True
        executor._execute_single_step = fake_single
        executor._execute_all_steps("G")
        assert called == [2]  # step 2 만 호출됨

    def test_writes_started_at_only_once(self, executor, phase_dir):
        # fixture step 2 의 started_at 미존재 — 첫 실행에서 한 번만 기록
        def fake_single(step, *_a):
            idx = json.loads((phase_dir / "index.json").read_text())
            for s in idx["steps"]:
                if s["step"] == step["step"]:
                    s["status"] = "completed"
                    s["summary"] = "done"
            (phase_dir / "index.json").write_text(json.dumps(idx))
            return True
        executor._execute_single_step = fake_single
        executor._execute_all_steps("G")
        idx = json.loads((phase_dir / "index.json").read_text())
        assert "started_at" in idx["steps"][2]

    def test_dry_run_iterates_all_pending(self, executor, phase_dir, capsys):
        executor._dry_run = True
        called = []
        executor._execute_single_step = lambda s, _g: called.append(s["step"]) or True
        executor._execute_all_steps("G")
        # dry-run: 모든 pending step 순차 호출 (fixture: step 2 만 pending)
        assert called == [2]


class TestFinalize:
    def test_writes_phase_completed_at(self, executor, phase_dir, top_index):
        executor._top_index_file = top_index
        executor._run_git = lambda *a: MagicMock(returncode=0, stdout="", stderr="")
        executor._finalize()
        idx = json.loads((phase_dir / "index.json").read_text())
        assert "completed_at" in idx
        # top index 도 업데이트
        top = json.loads(top_index.read_text())
        mvp = next(p for p in top["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "completed"

    def test_no_push_by_default(self, executor, phase_dir, top_index):
        executor._top_index_file = top_index
        calls = []
        def fake_git(*args):
            calls.append(args)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        executor._finalize()
        push_calls = [c for c in calls if c[:1] == ("push",)]
        assert push_calls == []

    def test_push_when_auto_push(self, executor, phase_dir, top_index):
        executor._top_index_file = top_index
        executor._auto_push = True
        calls = []
        def fake_git(*args):
            calls.append(args)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        executor._finalize()
        push_calls = [c for c in calls if c[0] == "push"]
        assert len(push_calls) == 1
        assert "feat-mvp" in str(push_calls[0])

    def test_push_failure_exits(self, executor, phase_dir, top_index):
        executor._top_index_file = top_index
        executor._auto_push = True
        def fake_git(*args):
            if args[0] == "push":
                return MagicMock(returncode=1, stdout="", stderr="auth failed")
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        with pytest.raises(SystemExit) as exc:
            executor._finalize()
        assert exc.value.code == 1


class TestEnsureClaudeCliMessage:
    def test_message_includes_install_url(self, executor, monkeypatch, capsys):
        monkeypatch.setattr(ex.shutil, "which", lambda name: None)
        with pytest.raises(SystemExit):
            executor._ensure_claude_cli()
        out = capsys.readouterr().out
        assert "docs.anthropic.com" in out
        assert "command -v claude" in out
        assert "--dry-run" in out


class TestLockEdgeCases:
    def test_lock_is_stale_permission_error(self, executor, phase_dir, monkeypatch):
        (phase_dir / ".lock").write_text(json.dumps({"pid": 99, "started_at": "x", "host": "h"}))
        def fake_kill(pid, sig):
            raise PermissionError()
        monkeypatch.setattr(ex.os, "kill", fake_kill)
        # PermissionError → live 로 간주 → None 반환
        assert ex.StepExecutor._lock_is_stale(phase_dir / ".lock") is None

    def test_lock_is_stale_missing_pid(self, executor, phase_dir):
        (phase_dir / ".lock").write_text(json.dumps({"host": "h"}))  # pid 없음
        reason = ex.StepExecutor._lock_is_stale(phase_dir / ".lock")
        assert reason == "missing pid"


class TestRunGitVerboseOff:
    def test_verbose_off_does_not_log_git_stderr(self, executor, capsys):
        executor._verbose = False
        mock_result = MagicMock(returncode=0, stdout="", stderr="some warning")
        with patch("subprocess.run", return_value=mock_result):
            executor._run_git("status")
        # verbose off — stderr 로그 없음
        assert "git status stderr" not in capsys.readouterr().err


class TestSafeHostname:
    def test_returns_hostname_or_unknown(self):
        # 정상 환경에서는 unknown 이 아닌 무엇이든 반환
        result = ex.StepExecutor._safe_hostname()
        assert isinstance(result, str)
        assert len(result) > 0


class TestCheckoutBranchAlreadyOnBranch:
    def test_already_on_target_branch_skips_checkout(self, executor):
        # 이미 feat-mvp 에 있으면 checkout 호출 안 함
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args == ("rev-parse", "--abbrev-ref", "HEAD"):
                return MagicMock(returncode=0, stdout="feat-mvp\n", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        executor._checkout_branch()
        # checkout 호출 없음
        assert not any(c[0] == "checkout" for c in calls)


class TestExecuteSingleStepRetryFeedback:
    def test_retry_resets_status_and_keeps_started_at(self, executor, phase_dir):
        executor._max_retries = 2
        executor._run_git = lambda *a: MagicMock(returncode=0, stdout="", stderr="")
        # 첫 호출: status 안 갱신 (즉 pending 유지) → retry
        # 두번째 호출: status 안 갱신 → final error
        with patch("subprocess.run", return_value=MagicMock(returncode=0, stdout="{}", stderr="")):
            with pytest.raises(SystemExit):
                executor._execute_single_step({"step": 2, "name": "ui"}, "G")
        idx = json.loads((phase_dir / "index.json").read_text())
        assert len(idx["steps"][2]["attempts"]) == 2  # 두 번 시도됨


class TestResetFromStepEdges:
    def test_reset_preserves_attempts_before_n(self, executor, phase_dir):
        idx = json.loads((phase_dir / "index.json").read_text())
        idx["steps"][1]["attempts"] = [{"attempt": 1, "elapsed_sec": 30}]
        (phase_dir / "index.json").write_text(json.dumps(idx))
        executor._reset_from_step(2)
        idx2 = json.loads((phase_dir / "index.json").read_text())
        assert idx2["steps"][1]["attempts"] == [{"attempt": 1, "elapsed_sec": 30}]

    def test_reset_clears_attempts_at_or_after_n(self, executor, phase_dir):
        idx = json.loads((phase_dir / "index.json").read_text())
        idx["steps"][2]["attempts"] = [{"attempt": 1}]
        (phase_dir / "index.json").write_text(json.dumps(idx))
        executor._reset_from_step(2)
        idx2 = json.loads((phase_dir / "index.json").read_text())
        assert "attempts" not in idx2["steps"][2]
