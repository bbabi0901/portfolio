# Step 6: operations-helpers

## 읽어야 할 파일

- `.claude/commands/harness.md` (Step 0 결과 — SDD+TDD AC, 에러 복구, multi-task 가이드 적용됨)
- `.claude/settings.json` (Step 4 결과)
- `phases/harness-refinement/index.json` (현재 task 진행 상태 참고용)

## 작업

운영 보조용 슬래시 명령 두 개 추가 + `harness.md` 에 cross-link 추가. 두 명령은 read-only 진단 전용.

### A. `/harness-status` 명령

`.claude/commands/harness-status.md` 신규 생성:

```markdown
프로젝트의 모든 phase 진행 상황을 한 표로 보여주라. 본 명령은 read-only — 어떤 파일도 수정하지 않는다.

수행 절차:

1. `phases/index.json` 을 읽어 task 디렉토리 목록을 얻는다. 파일 부재 시 "no phases registered" 출력 후 종료.

2. 각 task 의 `phases/<dir>/index.json` 을 읽어 다음 정보를 수집:
   - 전체 step 수, completed/pending/error/blocked 별 수
   - 가장 최근 timestamp (started_at / completed_at / failed_at / blocked_at 중)
   - retry 누적 (각 step 의 `attempts` 배열 길이 합산)

3. 다음 표를 출력 (Phase 단위):

| Phase | Status | Steps (✓/▶/!/⏸) | Last Update | Retries |
|---|---|---|---|---|
| harness-refinement | pending | 3/4/0/0 | 2026-05-06 14:23 | 2 |

   - `Status` 는 `phases/index.json` 의 phase 항목 status.
   - `Steps` 는 completed/pending/error/blocked 카운트.
   - `Retries` 는 모든 step 의 `attempts` 배열 길이 합. 0 이면 빈칸.
   - `Last Update` 는 KST iso 의 날짜·시간 부분.

4. 진행 중 항목이 있으면 (status="pending" 이고 started_at 있음, 또는 error/blocked) 다음 후속 표로 강조:

| Phase | Step | Name | Status | Attempts | Started | Notes |

   - `Notes` 는 error_message 또는 blocked_reason (truncate to 60 chars).

5. 잔재 lock 파일 (`phases/*/.lock`) 이 있으면 "⚠ stale lock files: ..." 한 줄 추가.

6. 마지막에 다음 행동 안내:
   - 모두 completed 면: "All phases complete. New phase 작성: .claude/commands/harness.md 참조."
   - error 가 있으면: "수동 복구: status 를 'pending' 으로 바꾸고 error_message 를 삭제, 그 후 재실행."
   - blocked 가 있으면: "차단 사유 해결 후 status 를 'pending' 으로 바꾸고 blocked_reason 삭제, 재실행."

이 명령은 정보 출력만 한다. 자동 복구·정리를 시도하지 마라. 사용자가 결정할 수 있도록 안내만.
```

### B. `/harness-doctor` 명령

`.claude/commands/harness-doctor.md` 신규 생성:

```markdown
하네스 환경을 진단하라. 본 명령은 read-only — 자동 복구를 시도하지 않는다.

수행 절차: 각 항목을 PASS / WARN / FAIL 로 표시하고, FAIL 인 경우 다음 행동을 한 줄로 안내한다.

1. **claude CLI** — `claude --version` 실행 가능 여부.
   - FAIL 시: "https://docs.anthropic.com/en/docs/claude-code 에서 설치 후 PATH 확인."

2. **python3** — `python3 --version`.
3. **node / npm** — `node --version`, `npm --version`.
4. **jq** — `command -v jq`.
   - WARN 시: "block-dangerous.sh 가 fallback 모드(전체 JSON 매칭)로 동작. 정확도 위해 'brew install jq' 권장."

5. **pytest 설치** — `python3 -c "import pytest"` 또는 `pip show pytest`.
   - FAIL 시: "pip install -r requirements-dev.txt"

6. **잔재 lock 파일** — `phases/*/.lock` glob.
   - 각 lock 파일의 PID 를 읽고 살아있는지 확인 (`ps -p <pid>` 시도).
   - 죽은 PID → WARN + "rm phases/<phase>/.lock"
   - 살아있는 PID → INFO (정상 동작 중일 수 있음).

7. **error/blocked step** — `phases/index.json` + 각 task index.json 의 step status 검사.
   - 발견 시: 해당 step 의 phase / step 번호 / name / error_message·blocked_reason 표시 + 복구 안내.

8. **settings.json valid JSON** — `python3 -c "import json; json.loads(open('.claude/settings.json').read())"`.
9. **hook 스크립트 존재** — `.claude/hooks/{block-dangerous,post-session-check,session-start-check}.sh` 모두 존재하고 shebang 로 시작하는지.
10. **node_modules** — package.json 이 있고 node_modules 가 없으면 WARN + "npm ci".

각 항목 출력 형식 예:
```
PASS  claude CLI         (Claude Code 1.x.x)
PASS  python3            (3.13.2)
WARN  jq not installed   → fallback 동작 중. 'brew install jq' 권장
FAIL  pytest             → pip install -r requirements-dev.txt
INFO  lock present       phases/harness-refinement/.lock (pid 12345 alive)
```

마지막에 FAIL/WARN 개수 요약. 자동 복구 금지 — 사용자가 직접 결정.
```

### C. `harness.md` cross-link

`.claude/commands/harness.md` 의 E절(실행) 끝에 한 줄 추가:

> 진행 상황 일람: `/harness-status`. 환경 진단: `/harness-doctor`.

위치는 "에러 복구" 항목 직전. 본 step 에서 단 한 번만 추가 — Step 0 에서 추가하지 않는다.

## Acceptance Criteria

```bash
# 1. 신규 파일 존재
test -f .claude/commands/harness-status.md
test -f .claude/commands/harness-doctor.md

# 2. cross-link 적용
grep -q "/harness-status" .claude/commands/harness.md
grep -q "/harness-doctor" .claude/commands/harness.md

# 3. 두 명령이 read-only 임이 명시
grep -q "read-only" .claude/commands/harness-status.md
grep -q "read-only" .claude/commands/harness-doctor.md

# 4. 두 명령에 자동 복구 금지 명시
grep -q "자동 복구" .claude/commands/harness-status.md
grep -q "자동 복구" .claude/commands/harness-doctor.md

# 5. 기존 테스트 회귀 0 (안전망)
python3 -m pytest scripts/ -x
```

## 검증 절차

1. 위 AC 명령 실행.
2. 두 명령의 마크다운 본문이 다음 원칙을 어기지 않는지 확인:
   - 절대 read-write 동작을 권유하지 않음 (예: "rm 자동 실행" 금지).
   - 사용자에게 결정권을 남김.
   - `claude --dangerously-skip-permissions` 같은 위험 옵션을 권유하지 않음.
3. 결과에 따라 `phases/harness-refinement/index.json` 의 step 6 을 업데이트:
   - 성공 → `"status": "completed"`, `"summary": "/harness-status, /harness-doctor 명령 추가, harness.md cross-link"`
   - 3 회 시도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"` + `"blocked_reason"` 후 즉시 중단

## 금지사항

- 두 명령에 read-write 동작(파일 삭제, 자동 status 변경, lock 자동 정리 등)을 추가하지 마라. 이유: 진단 명령이 부수효과를 가지면 사용자 신뢰 손상.
- `claude --dangerously-skip-permissions` 같은 옵션을 안내 메시지에 넣지 마라. 이유: 사용자가 검토 없이 실행할 위험.
- 두 명령이 동일 정보를 반복 출력하지 마라. /harness-status 는 진행률, /harness-doctor 는 환경 진단 — 책임 분리.
- harness.md 의 E절 외 다른 위치에 cross-link 을 넣지 마라. 이유: 일관성.
- `scripts/`, `.claude/settings.json`, `phases/<other>/` 를 수정하지 마라. 본 step 범위 외.
- 기존 테스트를 깨뜨리지 마라.
