# docs/agents/ — Agent Profiles

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 새 agent 추가 시 갱신
**Related**: ../../AGENTS.md, ../../CLAUDE.md, ../../.claude/commands/
**SSoT keys**: (없음 — 본 디렉토리 자체가 agent 의 SSoT)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

> `AGENTS.md` 가 목차라면, 본 디렉토리는 각 agent 의 풍부한 정의 (입력/출력/도구/트리거/AC).
> 슬래시 명령 prompt 는 `.claude/commands/<name>.md` 에. 본 디렉토리는 **spec** (인간 + agent 가 읽는 정의).

## 분류

- **Real (구현 완료)**: [harness](harness.md), [harness-status](harness-status.md), [harness-doctor](harness-doctor.md), [review](review.md)
- **Virtual (예정/로드맵)**: [doc-gardener](doc-gardener.md), [qa-runner](qa-runner.md), [spec-keeper](spec-keeper.md), [refactor-bot](refactor-bot.md)

## 표준 7절 카드 형식

각 agent `.md` 는 다음 7절을 가진다 (예외 없음):

| # | 절 | 내용 |
|---|---|---|
| 1 | **Role** | 한 줄 정의 — agent 가 *무엇을* 하는지 |
| 2 | **Trigger** | 어떻게 호출되는가 — `/<name>`, cron, on-PR, 자연어 키워드 등 |
| 3 | **Inputs** | 어떤 컨텍스트/파일을 읽는가 — SSoT 경로 명시 |
| 4 | **Outputs** | 어떤 변경/보고를 만드는가 — 산출물 파일·메시지 형식 |
| 5 | **Tools** | 사용 가능한 CC 도구 — Read/Edit/Bash/WebFetch/Agent/TodoWrite 등 |
| 6 | **Guardrails** | 절대 하지 말아야 할 것 — "X 하지 마라. 이유: Y" 형식 |
| 7 | **AC** | 호출 결과 검증 방법 — 가능하면 실행 가능한 명령 |

> Real agent 는 위 7절 모두 완비. Virtual agent 는 AC 자리에 "구현 시 본 spec 을 별도 step 으로 분리" 명시.

## 새 agent 추가 절차

1. 본 디렉토리에 `<name>.md` 작성 (위 7절 모두).
2. `../../AGENTS.md` 의 **Agents 디렉토리** 표에 한 줄 추가.
3. `.claude/commands/<name>.md` 가 있으면(=Real) 두 파일 cross-link.
4. `spec.json features[]` 에 영향 있는 agent 면 `FEAT-XXX` 신규 등록.

## 현재 목록

| Agent | 파일 | 상태 | 우선순위 (구현 전) |
|---|---|---|---|
| harness | [harness.md](harness.md) | Real | — |
| harness-status | [harness-status.md](harness-status.md) | Real | — |
| harness-doctor | [harness-doctor.md](harness-doctor.md) | Real | — |
| review | [review.md](review.md) | Real | — |
| doc-gardener | [doc-gardener.md](doc-gardener.md) | Virtual | 중 |
| qa-runner | [qa-runner.md](qa-runner.md) | Virtual | 상 (Phase 8/9 deployment 전) |
| spec-keeper | [spec-keeper.md](spec-keeper.md) | Virtual | 상 (`npm run check:spec` 가 부분 수행 — 자동화만 추가) |
| refactor-bot | [refactor-bot.md](refactor-bot.md) | Virtual | 하 (본 프로젝트 규모 대비 ROI 낮음) |

## 운영 원칙 (요약 — 자세히는 각 파일)

- Real agent 의 동작 변경 시 `.claude/commands/<name>.md` 와 본 spec **동시 갱신**. drift 발생 시 어느 쪽이 진실인지 모호해진다.
- Virtual agent 가 Real 로 승격될 때는 (1) `.claude/commands/<name>.md` 추가 → (2) 본 spec 의 "Virtual" 표기 제거 → (3) AGENTS.md 표의 _italic_ 제거 + 트리거 채우기 → (4) `spec.json features[]` 에 등록 (사용자에게 보이는 동작이면).
- 모든 agent 는 **AGENTS.md 의 우선순위 규칙** (CLAUDE.md > AGENTS.md > docs/) 을 따른다.
