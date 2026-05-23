# Agent: harness (Builder)

<!-- agents-md-meta -->
**Owner agent**: harness 자신 — 본 spec 은 워크플로우 변경 시 갱신
**Related**: ../../AGENTS.md, ../../CLAUDE.md, ../../.claude/commands/harness.md, ../../scripts/README.md, index.md
**SSoT keys**: spec.features (FEAT-XXX 등록 책임), spec.testScenarios (TS-NN 매핑)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

> 실제 슬래시 명령의 prompt instructions 는 [.claude/commands/harness.md](../../.claude/commands/harness.md) 에 있다. 본 파일은 **spec** (역할·도구·가드레일·검증).

## Role

큰 작업을 자기완결적 step (단일 모듈/레이어 단위) 로 분해하고, `phases/{task}/step{N}.md` 파일들을 만들어 `scripts/execute.py` 가 자동 실행할 수 있도록 준비하는 **Builder + Planner**. 작업 사이즈가 크지 않으면 직접 implement 도 수행.

## Trigger

- `/harness` — 슬래시 명령
- 자연어 트리거: "큰 작업이야", "기능 추가", "검색 도입", "마이그레이션", "리팩터" 같은 다중 모듈 변경 의도
- 사용자가 plan mode 종료 후 "이 plan 을 하네스 step 으로 변환해줘" 라고 명시할 때

❌ 트리거 아님: 단일 파일 수정, 카피/색 변경, 오타 수정 → 그냥 자연어로 직접 요청.

## Inputs

다음 파일들을 매 step 시작 시 가드레일로 읽는다 (execute.py 가 자동 주입):
- `CLAUDE.md` (전체) — 최우선 규칙
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md` — 의도·구조·결정
- `docs/UI_GUIDE.md`, `docs/PAGES.md`, `docs/RESPONSIVE.md` — UI/UX 변경 시
- `docs/TEST_SCENARIOS.md`, `docs/TESTING.md` — 테스트 매핑
- `spec.json` — features[]/testScenarios[]/errorPolicies[]
- 이전 step 의 `summary` (execute.py 가 다음 step 프롬프트에 누적 주입)

추가로 phase 단위로 읽는 것:
- `phases/{task}/index.json` — step 목록 + 상태
- `phases/{task}/step{N-1}-output-attempt{K}.json` — 직전 attempt 의 stdout/stderr (디버깅)

## Outputs

- `phases/index.json` — top-level task 인덱스 (신규 task 시 항목 추가)
- `phases/{task}/index.json` — step 목록 + status/started_at/completed_at/summary/attempts
- `phases/{task}/step{N}.md` — N 개 (자기완결적 작업 지시서)
- `phases/{task}/step{N}-output-attempt{K}.json` — attempt 별 Claude CLI 출력 (execute.py 자동 생성)
- `phases/{task}/run.log` — phase 실행 이벤트 로그 (execute.py 자동 생성)
- 브랜치 `feat/{task}` (또는 사용자 git workflow 규칙 따라 type-prefix 슬래시)
- 2단계 commit per step — `feat({task}): step N — <name>` + `chore({task}): step N output`

## Tools

`.claude/commands/harness.md` 에서 다음 도구 활용 (Claude Code 기본 제공):
- **Read** — 가드레일 문서, 이전 step 코드 읽기
- **Write / Edit** — phases/*, 산출 코드
- **Bash** — `git`, `npm`, `python3 scripts/execute.py`
- **Agent** — 병렬 탐색 (Explore subagent), 설계 안 비교 (Plan subagent)
- **TodoWrite / TaskCreate** — 진행 추적
- **AskUserQuestion** — Phase B (논의) 단계, 모호한 결정사항
- **WebSearch / WebFetch** — 외부 라이브러리·표준 확인 (선택)

자동 실행 시 (execute.py):
- `claude -p --dangerously-skip-permissions --output-format json <prompt>` 으로 새 Claude 세션 spawn
- subprocess 타임아웃 (`--timeout` flag, 기본 1800s)
- atomic lock (`phases/{task}/.lock`) — 동시 실행 방지
- 자가 교정 retry — 최대 `--max-retries` 회 (기본 3), 직전 에러 메시지를 다음 attempt 프롬프트에 피드백

## Guardrails

- **Dirty 작업트리 실행 금지**. 이유: `git add -A` 가 사용자 미커밋 작업까지 흡수해 잘못된 feat 커밋을 만듦. `--allow-dirty` 우회 가능하나 사용자 명시 승인 필요.
- **SDD+TDD 순서 절대 위반 금지**. 사용자에게 보이는 새 기능 step 은 (1) `spec.json features[]` 에 `FEAT-XXX` 등록 → (2) 실패 테스트 작성 → (3) 통과 구현. 이유: 본 프로젝트의 핵심 규칙 (CLAUDE.md CRITICAL).
- **Lock 우회 금지**. `phases/{task}/.lock` 이 있고 PID 가 살아있으면 abort. stale 만 자동 회수. 이유: 동시 두 인스턴스 = index.json 레이스 + 중복 commit.
- **Build hook 의존 금지**. PR 게이트는 `npm run check:spec && lint && test`. `npm run build` 는 prebuild=`sync:notion` 트리거로 Notion 토큰 의존이라 부적합.
- **step 분해 시 "step 사이 의존성 = 이전 summary 만"**. step{N}.md 가 step{N-1} 의 내부 변수·구현 디테일을 가정하지 마라. 이유: 각 step 은 독립 Claude 세션에서 실행.

## AC (Acceptance Criteria)

```bash
# 1. dry-run 으로 프롬프트 검증 (Claude 호출 X, git 변경 X)
python3 scripts/execute.py {task} --dry-run

# 2. step.md 의 AC 가 실행 가능 명령인지 (추상 서술 금지)
for s in phases/{task}/step*.md; do
  grep -A 5 "## Acceptance Criteria" "$s" | grep -qE "(npm|python|git|test)" || echo "Abstract AC in $s"
done

# 3. 모든 step 이 자기완결적 (이전 대화 외부 참조 0)
! grep -l "이전 대화\|앞에서 논의" phases/{task}/step*.md

# 4. 실제 실행
python3 scripts/execute.py {task}

# 5. 완료 후 PR 게이트
npm run check:spec
npm run lint
npm run test
```

## 다음 단계

- 자동 실행 진행 상황: `/harness-status`
- 환경 진단: `/harness-doctor`
- 변경 사항 리뷰: `/review`
- 별도 슬래시 명령 prompt 의 세부 워크플로우: [.claude/commands/harness.md](../../.claude/commands/harness.md)
