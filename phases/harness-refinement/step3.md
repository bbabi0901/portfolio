# Step 3: executor-observability

## 읽어야 할 파일

- `scripts/execute.py` 전체 (Step 1·2 결과 — 안전성 + UX 플래그 적용됨)
- `scripts/test_execute.py` 전체 (Step 1·2 신규 테스트 클래스 9 개 포함)
- 이전 step 산출물:
  - `phases/harness-refinement/index.json`

## 작업

`scripts/execute.py` + `scripts/test_execute.py` 두 파일 수정. 디버깅·관측을 위해 4 가지 보강.

### A. Attempt 별 output 보존

`_invoke_claude` 시그니처에 `attempt: int` 인자 추가:

```python
def _invoke_claude(self, step: dict, preamble: str, attempt: int = 1) -> dict:
```

`out_path` 결정:
```python
out_path = self._phase_dir / f"step{step_num}-output-attempt{attempt}.json"
```

attempt 별 파일은 누적 보존 — 덮어쓰지 않는다.

`_execute_single_step` 의 retry 루프 안에서 `_invoke_claude` 호출 시 현재 `attempt` 값을 전달.

**호환 유지**: retry 루프가 status==completed 또는 status==error 로 종료될 때, 마지막 attempt 의 output 파일을 `step{N}-output.json` 으로 복사 (legacy 경로 — 기존 `TestInvokeClaude` 의 `test_saves_output_json` 가정 보호). 이 복사는 dry-run 시 skip.

### B. Phase run.log

```python
def _log_event(self, event: str, **fields) -> None:
    """phases/<phase>/run.log 에 한 줄 append. 형식: ISO ts [scope] event key=val ..."""
```

세부:
- 파일 경로: `self._phase_dir / "run.log"`.
- 모드: append, UTF-8.
- 한 줄 형식:
  ```
  2026-05-06T14:23:01+0900 [run] start phase=harness-refinement total=7
  2026-05-06T14:23:01+0900 [run] lock_acquired pid=12345
  2026-05-06T14:23:02+0900 [step 0] start name=harness-rules-update
  2026-05-06T14:38:11+0900 [step 0] completed elapsed=909 attempt=1
  2026-05-06T14:38:11+0900 [step 0] cost_usd=0.34 session_id=abc123
  2026-05-06T14:38:11+0900 [run] release_lock
  2026-05-06T14:38:12+0900 [run] finalized
  ```
- `scope` 는 `"run"` 또는 `"step N"`.
- dry-run 시 run.log 에 `[run] dry_run=true` 한 줄 만 기록(혼란 방지).

호출 지점 (최소):
- `run()` 시작 직후
- `_acquire_lock` 성공 후
- `_release_lock` 직전
- `_execute_all_steps` 의 각 step 시작/종료
- `_execute_single_step` 의 retry 진입
- `_invoke_claude` 의 timeout 발생 시
- `_finalize` 마지막

### C. Claude result JSON 파싱

`_invoke_claude` 의 정상 경로(timeout 분기 외)에서 `result.stdout` 을 best-effort 파싱:

```python
parsed = None
if result.stdout:
    try:
        parsed = json.loads(result.stdout)
    except (json.JSONDecodeError, ValueError):
        pass

if isinstance(parsed, dict):
    output["claude_session_id"] = parsed.get("session_id")
    output["claude_total_cost_usd"] = parsed.get("total_cost_usd")
    output["claude_is_error"] = parsed.get("is_error", False)
    output["claude_num_turns"] = parsed.get("num_turns")
```

파싱 실패 시 silent — 절대 raise 하지 마라. CLI 출력 포맷 변경이 하네스를 깨뜨리면 안 된다.

`claude_is_error == True` 처리: `_execute_single_step` 의 status 검사 직후 추가 가드. status 가 completed 인데 `claude_is_error == True` 이면 강제로 error 로 분기 (status="error" + error_message="claude_is_error=true 응답"). 단 이건 보완 — 우선권은 step 이 직접 쓴 status 다.

### D. attempts 메트릭 누적

`_execute_single_step` 의 각 attempt 종료 직전(status 분기 전), index.json 의 해당 step 객체에 `attempts` 배열 append:

```python
attempt_record = {
    "attempt": attempt,
    "elapsed_sec": elapsed,
    "exit_code": output["exitCode"],
}
if output.get("timeout"):
    attempt_record["timeout"] = True
if "claude_total_cost_usd" in output:
    attempt_record["cost_usd"] = output["claude_total_cost_usd"]
if "claude_session_id" in output:
    attempt_record["session_id"] = output["claude_session_id"]

step_obj = next(s for s in index["steps"] if s["step"] == step_num)
step_obj.setdefault("attempts", []).append(attempt_record)
self._write_json(self._index_file, index)
```

이 기록은 retry 가 일어나도 누적되어 디버깅 시 "왜 1차에 실패하고 2차에 성공했는지" 추적 가능.

### E. 잔재 파일 git 커밋 제외

`_commit_step` 의 `git reset HEAD --` 호출 목록에 다음 추가:
- `phases/<phase>/run.log`
- `phases/<phase>/.lock` (Step 1 에서 추가 미루어진 경우 여기서 확정)
- `phases/<phase>/step*-output-attempt*.json` (glob 패턴, 모든 attempt 파일)

`step{N}-output.json` (legacy 경로) 는 기존대로 reset 목록에 포함.

### F. 동반 테스트

```python
class TestAttemptOutputs:
    def test_attempt_files_accumulate_on_retry(self, executor, phase_dir, monkeypatch): ...
    def test_legacy_output_json_mirrors_last_attempt(self, executor, phase_dir): ...
    def test_attempt_files_excluded_from_commit(self, executor): ...

class TestRunLog:
    def test_log_event_appends_line(self, executor, phase_dir): ...
    def test_run_log_format_is_parseable(self, executor, phase_dir): ...
    def test_run_log_excluded_from_commit(self, executor): ...
    def test_dry_run_minimal_logging(self, executor, phase_dir): ...

class TestClaudeResultParse:
    def test_parses_valid_json_stdout(self, executor): ...
    def test_handles_invalid_json_silently(self, executor): ...
    def test_records_session_id_and_cost(self, executor): ...
    def test_handles_empty_stdout(self, executor): ...
    def test_is_error_overrides_completed_status(self, executor, phase_dir, monkeypatch): ...

class TestAttemptsMetric:
    def test_attempts_appended_per_attempt(self, executor, phase_dir, monkeypatch): ...
    def test_attempts_persist_across_retry(self, executor, phase_dir, monkeypatch): ...
    def test_attempts_include_cost_when_available(self, executor, phase_dir, monkeypatch): ...
```

## Acceptance Criteria

```bash
# 1. 문법 OK
python3 -c "import ast; ast.parse(open('scripts/execute.py').read())"

# 2. 새 테스트 통과
python3 -m pytest scripts/test_execute.py::TestAttemptOutputs scripts/test_execute.py::TestRunLog scripts/test_execute.py::TestClaudeResultParse scripts/test_execute.py::TestAttemptsMetric -x -v

# 3. 기존 회귀 0 (Step 1·2 추가분 포함)
python3 -m pytest scripts/test_execute.py -x
```

## 검증 절차

1. 위 AC 명령 실행.
2. `_invoke_claude` 시그니처에 attempt 인자가 디폴트 1 로 추가되었는지 확인 — 기존 호출(4개 테스트의 `executor._invoke_claude(step, preamble)`)이 깨지지 않아야 한다.
3. `_invoke_claude` 가 dry-run 분기에서 run.log 에 매 step 의 라인을 쓰지 않도록 확인 (Step 2 의 dry-run 의도와 일관성).
4. 결과에 따라 `phases/harness-refinement/index.json` 의 step 3 을 업데이트:
   - 성공 → `"status": "completed"`, `"summary": "execute.py 관측성 4종 추가 — attempt outputs / run.log / claude JSON 파싱 / attempts 메트릭, 16 신규 테스트"`
   - 3 회 시도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"` + `"blocked_reason"` 후 즉시 중단

## 금지사항

- `_invoke_claude` 의 attempt 인자에 디폴트 값을 부여하지 않으면 기존 4 개 테스트가 깨진다. **반드시 `attempt: int = 1`**.
- `claude_*` 필드 파싱 실패 시 절대 raise 하지 마라. CLI 출력 포맷 변경이 하네스를 무력화하면 안 된다.
- run.log 한 줄에 stdout/stderr 본문을 넣지 마라. 메트릭/이벤트만. 이유: 디스크 폭발 + 시크릿 누출 위험.
- attempt 별 output JSON 의 stderr/stdout 에 시크릿 마스킹은 본 step 범위 외. 별도 phase 에서 처리.
- run.log/.lock/output-attempt*.json 모두 git 커밋에서 제외하라. 잔재 커밋은 다음 사용자에게 노이즈.
- 기존 메서드 이름·시그니처를 바꾸지 마라.
- 기존 테스트를 깨뜨리지 마라.
