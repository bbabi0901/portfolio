# Step 5: coverage-and-integration

## 읽어야 할 파일

- `scripts/execute.py` 전체 (Step 1·2·3 결과 — 안전성 + UX + 관측성 적용됨)
- `scripts/test_execute.py` 전체 (Step 1·2·3 신규 테스트 클래스 13 개 포함)
- `scripts/test_settings.py` 전체 (Step 4 신규)
- `.claude/settings.json` (Step 4 갱신)
- `.claude/hooks/{block-dangerous,post-session-check,session-start-check}.sh` (Step 4 신규)
- 이전 step 산출물:
  - `phases/harness-refinement/index.json`

## 작업

다음 5 가지를 적용한다. 목적은 v3 결함이 다시 묻히지 않도록 **누락 영역 unit 테스트 + 통합 테스트 + coverage 측정 + 의존성 명세** 를 모두 갖추는 것.

### A. 누락 영역 unit 테스트 (`scripts/test_execute.py`)

기존 테스트가 미커버인 메서드들에 대한 클래스 추가:

```python
class TestEnsureCreatedAt:
    def test_writes_when_absent(self, executor, phase_dir): ...
    def test_idempotent_when_present(self, executor, phase_dir): ...
    def test_value_is_kst_iso(self, executor, phase_dir): ...

class TestExecuteSingleStep:
    def test_completed_returns_true_and_stamps_completed_at(
        self, executor, phase_dir, monkeypatch): ...
    def test_blocked_exits_2(self, executor, phase_dir, monkeypatch): ...
    def test_error_after_max_retries_exits_1(self, executor, phase_dir, monkeypatch): ...
    def test_retry_feeds_prev_error_to_preamble(self, executor, phase_dir, monkeypatch): ...
    def test_records_failed_at_on_final_error(self, executor, phase_dir, monkeypatch): ...
    def test_status_pending_after_retry_reset(self, executor, phase_dir, monkeypatch): ...
    def test_attempt_record_appended_each_iteration(
        self, executor, phase_dir, monkeypatch): ...

class TestExecuteAllSteps:
    def test_runs_only_pending(self, executor, phase_dir, monkeypatch): ...
    def test_skips_already_completed(self, executor, phase_dir, monkeypatch): ...
    def test_writes_started_at_only_once(self, executor, phase_dir, monkeypatch): ...

class TestFinalize:
    def test_writes_phase_completed_at(self, executor, phase_dir): ...
    def test_updates_top_index_to_completed(self, executor, phase_dir, top_index): ...
    def test_pushes_when_auto_push_true(self, executor, phase_dir, monkeypatch): ...
    def test_no_push_when_auto_push_false(self, executor, phase_dir, monkeypatch): ...
    def test_releases_lock(self, executor, phase_dir): ...

class TestRunIntegration:
    """run() 전체 흐름 통합 — 모두 mock."""
    def test_full_phase_succeeds(self, tmp_project, mock_pass_seq, mock_git_clean): ...
    def test_dry_run_does_not_mutate_index_or_files(self, tmp_project): ...
    def test_dirty_tree_blocks_run(self, tmp_project, mock_dirty_git): ...
    def test_lock_blocks_concurrent(self, tmp_project, phase_dir): ...
    def test_sigint_releases_lock_and_exits(self, tmp_project, phase_dir, monkeypatch): ...
```

`mock_pass_seq` / `mock_dirty_git` / `mock_git_clean` fixture 신규. `subprocess.run` 을 patch 하여 호출 인자(`["claude", ...]` vs `["git", ...]`) 에 따라 다른 결과 반환.

새 fixture 는 기존 4 개(`tmp_project`, `phase_dir`, `top_index`, `executor`) 시그니처를 변경하지 않는다.

### B. `requirements-dev.txt` 신규

루트(`./requirements-dev.txt`):

```
pytest>=7.4
pytest-cov>=4.1
coverage>=7.4
```

### C. `pyproject.toml` 신규 (이미 있으면 섹션만 추가)

```toml
[tool.pytest.ini_options]
testpaths = ["scripts"]
python_files = "test_*.py"
addopts = "-x"

[tool.coverage.run]
source = ["scripts"]
omit = [
    "scripts/test_*.py",
]

[tool.coverage.report]
fail_under = 85
show_missing = true
exclude_lines = [
    "pragma: no cover",
    "if __name__ == .__main__.:",
    "raise NotImplementedError",
]
```

`fail_under = 85` 는 thread/시그널/콘솔 라인 일부가 도달 어려움을 감안한 실용 임계.

### D. `scripts/README.md` 신규

```markdown
# scripts/

## execute.py — Harness Step Executor

본 프로젝트 하네스의 핵심 실행기. `phases/<task>/step{N}.md` 파일들을 헤드리스 Claude 로 순차 실행.

### 설치

\`\`\`bash
pip install -r requirements-dev.txt   # pytest, coverage
\`\`\`

`claude` CLI 가 PATH 에 있어야 한다 (https://docs.anthropic.com/en/docs/claude-code).
`jq` 가 설치되어 있으면 hook 파싱이 더 정확해진다 (없어도 fallback 동작).

### 실행

\`\`\`bash
python3 scripts/execute.py <phase>                  # 순차 실행
python3 scripts/execute.py <phase> --dry-run         # Claude 호출 없이 프롬프트만 검증
python3 scripts/execute.py <phase> --from-step 2     # step 2 부터 재실행 (이상 모두 pending 리셋)
python3 scripts/execute.py <phase> --push --verbose  # push 까지 + 디버그 출력
python3 scripts/execute.py <phase> --allow-dirty     # 작업트리 dirty 검사 우회 (위험)
python3 scripts/execute.py <phase> --max-retries 5 --timeout 3600   # 무거운 task 대응
\`\`\`

### 테스트

\`\`\`bash
python3 -m pytest scripts/ -x -v
python3 -m pytest scripts/test_execute.py --cov=scripts.execute --cov-report=term-missing --cov-fail-under=85
\`\`\`

### 동작 자동화 요약

execute.py 가 매 phase 실행에서 처리:

- 작업트리 dirty 검사 (phase 디렉토리 + phases/index.json 예외)
- atomic lock (PID + started_at) + atexit 정리
- SIGINT/SIGTERM 핸들링 → lock 해제 후 130 exit
- `feat-<phase>` 브랜치 자동 생성/체크아웃
- 매 step 프롬프트에 CLAUDE.md + docs/*.md 가드레일 주입
- 이전 step `summary` 누적 컨텍스트 전달
- attempt 별 output JSON 보존 (`step{N}-output-attempt{K}.json`)
- run.log 자체 로깅 (시작/종료/retry/timeout/lock)
- `claude --output-format json` 의 session_id, total_cost_usd, is_error 파싱
- 실패 시 최대 N 회(기본 3) 재시도, 이전 에러를 다음 attempt 프롬프트에 피드백
- 2 단계 커밋 (feat: 코드 / chore: 메타데이터)
- lock·run.log·attempt JSON 모두 git 커밋에서 제외

### 워크플로우 상세

`.claude/commands/harness.md` 참조.
\`\`\`
```

### E. Coverage 임계 도달 보강

`scripts/execute.py` 의 다음 라인은 단위 테스트로 도달 어려우므로 `# pragma: no cover` 주석을 허용한다 (꼭 필요한 곳만):
- `progress_indicator` 의 thread loop 본문 일부
- `if __name__ == "__main__":` 블록

단 `_install_signal_handlers`, `_acquire_lock` stale 분기 등은 monkeypatch 로 도달 가능 — 반드시 테스트로 커버.

## Acceptance Criteria

```bash
# 1. 의존성 설치
pip install -r requirements-dev.txt

# 2. 전체 테스트 통과 (test_execute.py + test_settings.py)
python3 -m pytest scripts/ -x -v

# 3. coverage 임계 통과 (≥ 85%)
python3 -m pytest scripts/test_execute.py \
    --cov=scripts.execute \
    --cov-report=term-missing \
    --cov-fail-under=85

# 4. 신규 파일 존재
test -f requirements-dev.txt
test -f scripts/README.md
test -f pyproject.toml || grep -q "tool.pytest" pyproject.toml
```

위 4 명령 모두 성공.

## 검증 절차

1. 위 AC 명령 실행.
2. `python3 -m pytest scripts/test_execute.py --collect-only` 로 테스트 개수 확인 — Step 1·2·3·5 추가분이 모두 수집되어야 한다 (기존 51 + 추가 ~50+).
3. coverage 리포트의 missing line 목록을 검토. 비주류 라인만 누락되었는지 확인 (signal handler, thread loop 등).
4. 결과에 따라 `phases/harness-refinement/index.json` 의 step 5 를 업데이트:
   - 성공 → `"status": "completed"`, `"summary": "누락 영역 26 신규 테스트 + requirements-dev/pyproject/README + coverage 85% 임계 통과"`
   - 3 회 시도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"` + `"blocked_reason"` 후 즉시 중단

## 금지사항

- 통합 테스트가 실제 `claude` 또는 `git` 명령을 호출하게 두지 마라. 모두 `subprocess.run` mock. 이유: CI/로컬 환경 차이로 flaky.
- coverage 임계 `fail_under` 를 100% 로 설정하지 마라. 이유: thread/시그널/콘솔 라인은 도달 어려움.
- 새 fixture 가 기존 `tmp_project`, `phase_dir`, `top_index`, `executor` 의 시그니처를 깨뜨리지 마라.
- pyproject.toml 가 이미 있는 경우 기존 섹션을 덮어쓰지 마라. 새 섹션만 append.
- requirements-dev.txt 에 pytest 외 무거운 의존성(black, mypy 등) 을 추가하지 마라. 이번 step 범위 외.
- README 에 PRD/ARCHITECTURE 의 자리표시자를 채우지 마라. 다른 worktree 의 작업 영역.
- `scripts/execute.py` 의 동작을 변경하지 마라. coverage 보강 외 새 기능 금지.
- 기존 테스트를 깨뜨리지 마라.
