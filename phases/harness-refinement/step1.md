# Step 1: executor-safety

## 읽어야 할 파일

먼저 아래 파일들을 정독하라. 본 step 은 `scripts/execute.py` 의 안전성 강화이며, 기존 51 개 테스트를 한 건도 깨뜨리지 않아야 한다.

- `scripts/execute.py` 전체 (현재 417 줄)
- `scripts/test_execute.py` 전체 (fixture 패턴 — `tmp_project`, `phase_dir`, `top_index`, `executor`)
- `.claude/commands/harness.md` (Step 0 결과 — 변경된 PR 게이트 명시)
- 이전 step 산출물:
  - `phases/harness-refinement/index.json` (현재 task 의 진행 상태)

## 작업

`scripts/execute.py` + `scripts/test_execute.py` 두 파일을 수정한다. 다음 4 가지 안전성 메커니즘을 추가하고, 각각에 대한 unit 테스트를 동반한다.

### A. Dirty-tree guard

**시그니처**:
```python
def _check_clean_tree(self) -> None:
    """phase 디렉토리와 phases/index.json 외부의 미커밋 변경이 있으면 abort."""
```

**규칙**:
- `git status --porcelain` 결과를 줄단위로 파싱.
- 다음 path 는 무시 (정상 시나리오):
  - `phases/{self._phase_dir_name}/` 으로 시작하는 모든 path (untracked step.md, index.json 변경 등)
  - 정확히 `phases/index.json` (새 task 등록 직후)
- 그 외 변경(staged/unstaged/untracked)이 한 줄이라도 있으면:
  ```
  ERROR: 작업트리에 phase 디렉토리 외 미커밋 변경이 있습니다.
  무시하려면 --allow-dirty 를 사용하세요.
  변경 목록:
    {paths up to first 10}
  ```
  exit 1.
- `__init__` 에 `allow_dirty: bool = False` 인자 추가. `True` 면 검사 skip + WARN 출력.
- 호출 위치: `run()` 의 `_acquire_lock` 직후, `_checkout_branch` 직전.
- argparse 에 `--allow-dirty` 플래그 추가.

### B. Timeout 예외 처리

`_invoke_claude` 의 `subprocess.run(...)` 호출을 `try/except subprocess.TimeoutExpired` 로 감싼다. 시그니처:

```python
try:
    result = subprocess.run(
        ["claude", "-p", "--dangerously-skip-permissions", "--output-format", "json", prompt],
        cwd=self._root, capture_output=True, text=True, timeout=self._timeout,
    )
except subprocess.TimeoutExpired as e:
    output = {
        "step": step_num, "name": step_name,
        "exitCode": -1, "timeout": True,
        "stdout": "",
        "stderr": f"[timeout after {self._timeout}s]",
    }
    # 정상 흐름과 동일하게 output JSON 저장
    out_path = self._phase_dir / f"step{step_num}-output.json"
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\n  WARN: Claude timeout after {self._timeout}s — retry path 진입")
    return output
```

`self._timeout` 은 일단 `1800` 하드코딩 유지(Step 2 에서 외부화). retry 루프(`_execute_single_step`)는 변경 없이 동작 — `exitCode != 0` 이므로 다음 attempt 로 진입한다.

### C. Lock 파일

**시그니처**:
```python
def _acquire_lock(self) -> None:
    """phases/{phase}/.lock 을 atomic 생성. 살아있는 PID 면 abort, 죽은 PID 면 회수."""

def _release_lock(self) -> None:
    """lock 파일 삭제. 부재 시 silent."""
```

**세부**:
- 락 경로: `self._phase_dir / ".lock"`.
- 락 내용: JSON `{"pid": <int>, "started_at": "<KST iso>", "host": "<hostname or 'unknown'>"}`.
- 생성 방식: `os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)` 으로 atomic.
- 생성 실패 (이미 존재) 시:
  - 락 파일을 읽고 PID 확인.
  - `os.kill(pid, 0)` 성공 → live → abort + exit 1, 사용자에게 PID/started_at 와 `rm phases/{phase}/.lock` 안내.
  - `OSError` (`ProcessLookupError` 또는 `PermissionError` 의 후자) → stale 또는 다른 사용자 — 안전 측에서 abort 가 기본. 단, **PID 가 자기 자신** 인 케이스(파이썬 재시작 후) 는 stale 로 간주하고 회수.
  - 손상된 JSON → stale 로 간주, WARN 출력 후 회수.
- `_release_lock` 은 `_finalize` 마지막 + `atexit.register(self._release_lock)` 양쪽에 등록.
- `socket.gethostname()` 실패 시 `"unknown"`.

### D. SIGINT/SIGTERM 핸들러

**시그니처**:
```python
def _install_signal_handlers(self) -> None:
    """SIGINT/SIGTERM 시 락 해제 + 130 exit."""
```

- `signal.signal(signal.SIGINT, _handler)` + `signal.signal(signal.SIGTERM, _handler)`.
- handler: `_release_lock()` 호출 후 `print("\n  Interrupted — released lock", file=sys.stderr)` + `sys.exit(130)`.
- `started_at` 은 정리하지 않는다 (의도적 — 재실행 시 첫 시작 시각 보존).
- `progress_indicator` 의 stop event 는 `__exit__` 에서 set 되므로 자연 정리됨.
- 호출 위치: `run()` 진입 직후, `_acquire_lock` 직전.

### E. `_check_blockers` 의도 명시 주석

기존 메서드는 동작 변경 없이 docstring 만 추가:

```python
def _check_blockers(self) -> None:
    """마지막 non-pending step 의 status 를 검사한다.

    정상 실행 흐름에서는 error/blocked 이면 즉시 sys.exit 하므로 그 이후 step 이 completed 가
    되는 일이 없다. 따라서 reverse 순회로 마지막 non-pending step 만 보면 충분.

    Note: 사용자가 수동으로 중간 step 을 error/blocked 로 두고 그 이후 step 을 completed 로
    바꾼 케이스는 검출하지 않는다. 그런 상태는 정상 흐름에서 만들어지지 않는다.
    """
```

### F. 동반 테스트

`scripts/test_execute.py` 에 다음 테스트 클래스를 추가한다 (기존 51 개 테스트와 공존, fixture 시그니처 변경 금지).

```python
class TestCheckCleanTree:
    def test_clean_tree_passes(self, executor): ...
    def test_phase_dir_changes_ignored(self, executor): ...
    def test_phases_index_json_change_ignored(self, executor): ...
    def test_unrelated_dirty_aborts(self, executor): ...
    def test_allow_dirty_skips(self, executor): ...

class TestTimeoutHandling:
    def test_timeout_returns_dict_with_timeout_field(self, executor): ...
    def test_timeout_records_exitcode_minus1(self, executor): ...
    def test_timeout_writes_output_json(self, executor): ...
    def test_normal_run_unaffected(self, executor): ...

class TestLock:
    def test_acquire_creates_lock_file(self, executor, phase_dir): ...
    def test_acquire_writes_pid_and_timestamp(self, executor, phase_dir): ...
    def test_acquire_aborts_when_live_pid(self, executor, phase_dir, monkeypatch): ...
    def test_acquire_recovers_when_dead_pid(self, executor, phase_dir, monkeypatch): ...
    def test_acquire_recovers_when_corrupt_json(self, executor, phase_dir): ...
    def test_release_removes_lock(self, executor, phase_dir): ...
    def test_release_silent_when_absent(self, executor, phase_dir): ...

class TestSignalHandlers:
    def test_sigint_handler_releases_lock(self, executor, phase_dir, monkeypatch): ...
    def test_sigterm_handler_releases_lock(self, executor, phase_dir, monkeypatch): ...
```

`os.kill(pid, 0)` 분기는 `monkeypatch.setattr(ex.os, "kill", ...)` 로 시뮬레이션. signal handler 테스트는 직접 핸들러를 호출(시그널 전송 안 함).

### G. lock 파일·관련 잔재가 git 에 커밋되지 않게

`_commit_step` 의 `git add -A` 직후의 `git reset HEAD --` 호출 목록에 `phases/<phase>/.lock` 을 추가하라. 이유: 잔재 lock 이 우발 커밋되면 다음 사용자가 stale lock 으로 abort.

## Acceptance Criteria

```bash
# 1. 문법 OK
python3 -c "import ast; ast.parse(open('scripts/execute.py').read())"

# 2. 새 테스트 통과
python3 -m pytest scripts/test_execute.py::TestCheckCleanTree scripts/test_execute.py::TestTimeoutHandling scripts/test_execute.py::TestLock scripts/test_execute.py::TestSignalHandlers -x -v

# 3. 기존 테스트 회귀 0
python3 -m pytest scripts/test_execute.py -x

# 4. CLI 에 --allow-dirty 플래그 노출
python3 scripts/execute.py --help 2>&1 | grep -q "allow-dirty"
```

위 4 명령 모두 성공.

## 검증 절차

1. 위 AC 명령 실행.
2. `scripts/execute.py` 를 다시 읽고:
   - 기존 메서드 이름 변경 없는지 (`_load_guardrails`, `_invoke_claude`, `_execute_single_step`, `_finalize` 등)
   - 클래스 상수 (`MAX_RETRIES`, `TZ`, `FEAT_MSG`, `CHORE_MSG`) 값 변경 없는지
   - argparse 의 기존 인자 (`phase_dir`, `--push`) 의미 변경 없는지
3. 결과에 따라 `phases/harness-refinement/index.json` 의 step 1 을 업데이트:
   - 성공 → `"status": "completed"`, `"summary": "execute.py 안전성 4종 추가 — dirty guard / timeout / lock / SIGINT, 17 신규 테스트"`
   - 3 회 시도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"` + `"blocked_reason"` 후 즉시 중단

## 금지사항

- argparse 의 기존 인자 `phase_dir`, `--push` 의 시그니처/의미를 변경하지 마라. 이유: 기존 사용자 명령어 호환.
- 클래스 상수 `MAX_RETRIES`, `TZ`, `FEAT_MSG`, `CHORE_MSG` 의 값을 변경하지 마라. 이유: Step 2 가 외부화 담당이며 기존 테스트가 클래스 상수 참조.
- 기존 메서드 이름을 바꾸지 마라. 이유: `test_execute.py` 가 `executor._stamp`, `_load_guardrails`, `_check_blockers` 등을 직접 호출.
- lock 파일을 git 커밋에 포함시키지 마라. 이유: 잔재 lock 이 다음 사용자를 막는다.
- 새 fixture 시그니처를 추가하지 마라. 기존 `tmp_project`/`phase_dir`/`top_index`/`executor` 만 사용. 이유: 기존 테스트의 fixture 의존 보호.
- `claude` CLI 부재 시 안내는 Step 2 의 책임. 이 step 에서 처리하지 마라.
- 기존 테스트를 깨뜨리지 마라.
