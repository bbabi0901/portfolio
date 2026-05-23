# Agent: harness-status (Inspector)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — phase 인덱스 스키마 변경 시 본 spec 갱신
**Related**: ../../AGENTS.md, ../../.claude/commands/harness-status.md, harness.md, index.md
**SSoT keys**: (없음 — phases/*/index.json 을 읽기만)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

> 실제 슬래시 명령 prompt: [.claude/commands/harness-status.md](../../.claude/commands/harness-status.md).

## Role

`phases/index.json` + 각 task 의 `index.json` 을 종합해 **모든 phase 의 진행 현황을 한 표로** 출력. 잔재 lock·error/blocked step 발견 시 안내. **read-only 자체완결** — 어떤 파일도 수정/복구하지 않는다.

## Trigger

- `/harness-status` 슬래시 명령

다른 트리거 없음. 자동 호출 안 됨. 사용자가 명시적으로 부를 때만.

## Inputs

- `phases/index.json` (top-level task 인덱스)
- `phases/*/index.json` (각 task 의 step 목록 + status/timestamps/attempts)
- `phases/*/.lock` (잔재 lock 파일 검출용)

추가 파일 읽기 없음. 코드/spec/docs 는 보지 않는다.

## Outputs

표 형식 stdout 출력 (수정 없음):
- **Phase 표**: dir / status / steps(✓/▶/!/⏸) / last update / retries
- **진행 중·문제 표** (error/blocked/started_at 있고 pending 인 항목): phase / step / name / status / attempts / started / notes
- **잔재 lock 경고** (`phases/*/.lock` 존재 시)
- **다음 행동 안내** — 모두 completed / error 있음 / blocked 있음 등 상태별

파일 변경 0. git 변경 0.

## Tools

- **Read** — phases/*/index.json
- **Bash** — `ls phases/*/.lock`, `cat`, `grep` (read-only 명령만)

❌ 사용 금지: Edit, Write, NotebookEdit, `git commit`, `git push`, lock 파일 삭제.

## Guardrails

- **자동 복구 금지**. lock 발견 → 알림만. status 가 error → 안내만. 이유: 사용자가 직접 결정해야 할 영역. 자동 복구는 데이터 손실 위험.
- **stale lock 자동 정리 금지**. 실행 중일 수도 있다. PID 가 살아있는지 확인은 OK 이나 삭제는 사용자 결정.
- **error_message·blocked_reason 60자 초과 시 truncate**. 이유: 표가 한 줄에 들어가지 않으면 가독성 손상.
- **추측 금지**. status 가 unknown 이면 "unknown" 그대로 출력. "아마 completed 일 것" 같은 추측 금지.

## AC

```bash
# 1. 출력에 모든 task 가 포함
expected_tasks=$(jq -r '.phases[].dir' phases/index.json | wc -l)
actual_in_output=$(/harness-status | grep -cE '^\| [a-z-]+' || echo 0)
# expected_tasks == actual_in_output

# 2. 잔재 lock 이 있다면 경고 라인 존재
[ -n "$(ls phases/*/.lock 2>/dev/null)" ] && /harness-status | grep -qi "lock"

# 3. 변경 0 — 호출 후 git status clean
before=$(git status --porcelain | wc -l)
/harness-status >/dev/null
after=$(git status --porcelain | wc -l)
[ "$before" -eq "$after" ]
```

## 관련 명령

- 더 깊은 진단: `/harness-doctor`
- 큰 작업 시작: `/harness`
