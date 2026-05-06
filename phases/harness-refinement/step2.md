# Step 2: executor-ux

## 읽어야 할 파일

- `scripts/execute.py` 전체 (Step 1 결과 — dirty guard / timeout / lock / SIGINT 추가됨)
- `scripts/test_execute.py` 전체 (Step 1 신규 테스트 클래스 4 개 포함)
- `.claude/commands/harness.md` (Step 0 결과)
- 이전 step 산출물:
  - `phases/harness-refinement/index.json`

## 작업

`scripts/execute.py` + `scripts/test_execute.py` 두 파일을 수정. 5 개 CLI 플래그 + claude CLI 검사 추가, 그리고 각각 unit 테스트 동반.

### A. argparse 확장

`main()` 의 `parser.add_argument` 다음 5 개 추가:

```python
parser.add_argument("--dry-run", action="store_true",
                    help="Claude 호출 없이 프롬프트만 stdout 출력. git/index 변경 없음.")
parser.add_argument("--from-step", type=int, metavar="N",
                    help="step N 부터 실행. N 이상의 step status/타임스탬프/error_message 모두 리셋.")
parser.add_argument("--max-retries", type=int, default=None,
                    help=f"step 당 최대 재시도. 기본 {StepExecutor.MAX_RETRIES}.")
parser.add_argument("--timeout", type=int, default=None, metavar="SEC",
                    help="Claude 호출 타임아웃. 기본 1800 초.")
parser.add_argument("-v", "--verbose", action="store_true",
                    help="프롬프트 길이, git stderr, 내부 분기를 stderr 로 출력.")
```

`StepExecutor.__init__` 에 대응 인자(`dry_run`, `from_step`, `max_retries`, `timeout`, `verbose`) 추가하고 인스턴스 변수 (`_dry_run`, `_from_step`, `_max_retries`, `_timeout`, `_verbose`) 로 보관.

`_max_retries` 는 None 이면 `self.MAX_RETRIES` (클래스 상수) 로 fallback.
`_timeout` 은 None 이면 `1800` 으로 fallback. **기존 클래스 상수 추가**: `DEFAULT_TIMEOUT_SEC = 1800` 신규. `_invoke_claude` 의 하드코딩 1800 → `self._timeout`.

상호 배타 검사 (`main()` 에서 인스턴스 생성 전):
- `--dry-run` + `--push` → `print("ERROR: --dry-run 은 commit 자체가 없어 push 할 게 없습니다.", file=sys.stderr); sys.exit(1)`
- `--from-step N` 이 음수이거나 `len(steps)` 초과 → 에러로 exit 1.

### B. `--dry-run` 동작

`run()` 분기 (다음 메서드들의 호출 여부 변경):

| 메서드 | --dry-run 시 |
|---|---|
| `_ensure_claude_cli` | skip (실제 호출 없음) |
| `_install_signal_handlers` | skip (lock 안 잡으므로 정리할 게 없음) |
| `_acquire_lock` | skip |
| `_check_clean_tree` | **유지** — 가드레일이 dirty 한 docs/CLAUDE.md 를 읽으면 결과 오염 |
| `_checkout_branch` | skip |
| `_ensure_created_at` | skip |
| step 루프 | 진행하되 _invoke_claude 가 dry-run 분기 |
| status 업데이트 | skip (호출자 측 가드) |
| `_finalize` | skip |

`_invoke_claude` 의 dry-run 분기:
- `subprocess.run` 호출 안 함.
- 프롬프트 전체를 stdout 에 출력:
  ```
  === DRY RUN: step N ({name}) ===
  --- guardrails (len: NNNN chars) ---
  {guardrails 본문}
  --- step ---
  {step.md 본문}
  === END step N ===

  ```
- output JSON 저장 안 함.
- 더미 dict 반환:
  ```python
  return {"step": step_num, "name": step_name, "exitCode": 0, "stdout": "", "stderr": "[dry-run]"}
  ```

`_execute_single_step` 의 dry-run 분기: `_invoke_claude` 호출 후 status 업데이트/index.json 쓰기/`_commit_step` 모두 skip 하고 `True` 반환.

### C. `--from-step N` 동작

`run()` 의 `_check_blockers` **직전**에:

```python
def _reset_from_step(self, n: int) -> None:
    """step N 이상의 모든 step 을 pending 으로 리셋."""
```

세부:
- N 이상의 step 에서:
  - `status` → `"pending"`
  - 다음 필드 모두 `pop`: `started_at`, `completed_at`, `failed_at`, `blocked_at`, `error_message`, `blocked_reason`, `summary`, `attempts`
- N 미만은 손대지 않음.
- 변경한 index.json 저장.
- 콘솔에 `"  Reset steps >= {N} (count: {k})"` 출력.

`__init__` 에서 `_from_step` 이 None 이 아니면 일찍 호출(`_reset_from_step` 은 `_check_blockers` 보다 먼저).

### D. `claude` CLI 부재 안내

```python
def _ensure_claude_cli(self) -> None:
    """shutil.which('claude') 검사. 없으면 친절한 안내 후 exit 1."""
```

세부:
- `shutil.which("claude")` 가 None 이면:
  ```
  ERROR: 'claude' CLI 를 PATH 에서 찾을 수 없습니다.

  설치 방법: https://docs.anthropic.com/en/docs/claude-code
  PATH 확인: command -v claude

  --dry-run 모드는 'claude' 없이도 프롬프트 검증 가능합니다.
  ```
  + `sys.exit(1)`.
- `--dry-run` 시 skip.
- 호출 위치: `run()` 진입 직후 (signal handler 설치 전).

### E. `--verbose` 동작

```python
def _log(self, msg: str) -> None:
    """verbose 모드에서만 stderr 에 [DEBUG] prefix 로 출력."""
    if self._verbose:
        print(f"[DEBUG] {msg}", file=sys.stderr)
```

다음 지점에서 `_log` 호출:
- `_load_guardrails` 직후: `f"guardrails loaded: {len(guardrails)} chars"`
- `_run_git` 의 stderr 가 비어있지 않으면: `f"git {args[0]} stderr: {r.stderr.strip()[:200]}"`
- `_invoke_claude` 진입 시 (정상/dry-run 둘 다): `f"step {step_num} prompt size: {len(prompt)} chars"`
- `_acquire_lock` 진입/`_release_lock`: `"acquired lock"`, `"released lock"`
- `_check_clean_tree`: `"clean tree check passed"` 또는 `f"clean tree skipped (--allow-dirty)"`

### F. 동반 테스트

`scripts/test_execute.py` 에 다음 클래스 추가:

```python
class TestDryRun:
    def test_dry_run_skips_subprocess(self, executor, phase_dir, capsys, monkeypatch): ...
    def test_dry_run_does_not_write_output_json(self, executor, phase_dir): ...
    def test_dry_run_does_not_modify_index(self, executor, phase_dir): ...
    def test_dry_run_with_push_errors(self, capsys): ...
    def test_dry_run_skips_lock(self, executor, phase_dir): ...

class TestFromStep:
    def test_from_step_resets_n_and_after(self, executor, phase_dir): ...
    def test_from_step_clears_timestamps_and_messages(self, executor, phase_dir): ...
    def test_from_step_preserves_before_n(self, executor, phase_dir): ...
    def test_from_step_out_of_range_errors(self, capsys): ...
    def test_from_step_negative_errors(self, capsys): ...

class TestRetryAndTimeoutFlags:
    def test_max_retries_flag_applied(self, tmp_project, phase_dir): ...
    def test_max_retries_fallback_to_class_constant(self, tmp_project, phase_dir): ...
    def test_timeout_flag_applied(self, tmp_project, phase_dir): ...
    def test_timeout_fallback_to_default(self, tmp_project, phase_dir): ...

class TestEnsureClaudeCli:
    def test_missing_cli_exits(self, executor, monkeypatch): ...
    def test_present_cli_passes(self, executor, monkeypatch): ...
    def test_dry_run_skips_check(self, executor, monkeypatch): ...

class TestVerbose:
    def test_verbose_off_silent(self, executor, capsys): ...
    def test_verbose_on_prints_debug(self, executor, capsys): ...
```

각 테스트는 `subprocess.run` / `shutil.which` 등을 mock. 실제 claude/git 호출 금지.

## Acceptance Criteria

```bash
# 1. 문법 OK
python3 -c "import ast; ast.parse(open('scripts/execute.py').read())"

# 2. 새 플래그 6 개 노출 (Step 1 의 --allow-dirty 포함)
python3 scripts/execute.py --help 2>&1 \
  | grep -E -- "(--dry-run|--from-step|--max-retries|--timeout|--verbose|--allow-dirty)" \
  | wc -l \
  | tr -d ' ' \
  | grep -q "^[6-9]\|^[0-9][0-9]"

# 3. 새 테스트 통과
python3 -m pytest scripts/test_execute.py::TestDryRun scripts/test_execute.py::TestFromStep scripts/test_execute.py::TestRetryAndTimeoutFlags scripts/test_execute.py::TestEnsureClaudeCli scripts/test_execute.py::TestVerbose -x -v

# 4. 기존 회귀 0 (Step 1 추가분 포함)
python3 -m pytest scripts/test_execute.py -x

# 5. dry-run + push 상호 배타
python3 scripts/execute.py harness-refinement --dry-run --push 2>&1 | grep -q "dry-run" && test ${PIPESTATUS[0]} -ne 0
```

## 검증 절차

1. 위 AC 명령 실행.
2. `_invoke_claude` 의 정상 경로 시그니처 (`(self, step, preamble) -> dict`) 가 변경되지 않았는지 확인 — 기존 `TestInvokeClaude` 4 개 테스트가 호출 형태 가정.
3. `--from-step 0` 명령 시 모든 step 이 pending 으로 리셋되는지 수동 확인:
   ```bash
   python3 scripts/execute.py harness-refinement --from-step 0 --dry-run
   ```
4. 결과에 따라 `phases/harness-refinement/index.json` 의 step 2 를 업데이트:
   - 성공 → `"status": "completed"`, `"summary": "execute.py CLI 6 플래그 + claude CLI 검사 + verbose 로깅, 21 신규 테스트"`
   - 3 회 시도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"` + `"blocked_reason"` 후 즉시 중단

## 금지사항

- `_invoke_claude(self, step, preamble)` 시그니처를 변경하지 마라. 기존 4 개 테스트가 깨진다. attempt 인자는 Step 3 의 책임.
- `--dry-run` 모드가 우발적으로 `index.json` 을 변경하지 못하도록 호출자 측 가드를 명시 추가하라. 사일런트 변경은 디버깅을 망친다.
- `--verbose` 가 stdout 을 어지럽히지 마라 — 반드시 stderr.
- `--from-step` 이 N 미만의 step 을 손대지 않게 하라. 사용자가 이미 통과한 step 을 잃으면 안 된다.
- 기존 fixture 시그니처(`tmp_project`, `phase_dir`, `top_index`, `executor`) 를 변경하지 마라.
- 실제 `claude` 또는 `git` 명령을 호출하는 테스트를 만들지 마라. 모두 mock.
- 기존 테스트를 깨뜨리지 마라.
