# Agent: qa-runner (Virtual — 예정)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — qa-runner 가 Real 로 승격되면 자체 owner
**Related**: ../../AGENTS.md, ../../spec.json, ../TEST_SCENARIOS.md, ../TESTING.md, index.md
**SSoT keys**: spec.testScenarios (TS-NN 실행 대상), spec.features.tests (파일 매핑)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
**Status**: 🔵 Planned: Phase 1 구현 가능 — 우선순위 **상** (Phase 8/9 deployment 전 필요)
<!-- /agents-md-meta -->

> 본 agent 는 아직 구현되지 않음. 실제 구현 시 `.claude/commands/qa-run.md` + `.github/workflows/qa.yml` + 보고서 생성기를 별도 phase 로.

## Role

`spec.json testScenarios[]` (TS-NN) 를 **자동 일괄 실행**하고 회귀 보고서를 만든다. 현재는 `npm run test`/`e2e` 로 vitest·Playwright 가 부분 수행하지만, TS-NN 단위 매핑 + 보고서 + 회귀 추적이 없음.

예시 동작:
- `testScenarios[]` (현재 101건) 중 변경된 코드와 연관된 항목 자동 식별 (spec.features.tests 매핑)
- 해당 항목만 우선 실행 → 통과 시 전체 실행
- 실패 항목별 stacktrace + 가능한 fix 제안 (Agent 호출)
- 회귀 (이전 통과 → 이번 실패) 시 PR 라벨 `regression` 자동 부여

## Trigger (구현 시)

- `/qa-run` 슬래시 명령 — 수동 실행
- on-PR 이벤트 — GitHub Actions
- on-push (main) — 회귀 즉시 감지
- /loop 의 Verify 단계에서 호출 (옵션, ADR-036)

## Inputs (구현 시)

- `spec.json` — testScenarios[] 전체, features[].tests 매핑
- `docs/TEST_SCENARIOS.md` — TS-NN 의 사람-가독 설명
- `specs/**` (vitest unit·integration), `tests/e2e/**` (Playwright)
- `git diff main..HEAD` — 변경 파일 식별 → 영향받는 TS 추출

## Outputs (구현 시)

- 실행 보고서 `phases/qa-runs/{date}-{branch}.md` (또는 PR 코멘트):
  ```
  ## QA Run — feat/X (2026-05-23)

  Triggered TS: TS-12, TS-15, TS-23 (변경 파일 매핑)
  Full suite: 68/70 통과 (2 실패)

  ### 실패
  - TS-23 (Contact form 검증): tests/contact.test.ts:42 — assertion 실패
    - 회귀? Yes (main 에서는 통과)
    - 가능한 원인: lib/contact-schema.ts 의 `email.optional()` 제거됨
  ```
- PR 라벨 `qa-pass` / `qa-fail` / `regression` 자동 부여
- 회귀 발견 시 issue 자동 생성

## Tools (구현 시)

- Bash — `npm test`, `npm run e2e`, `npx playwright test --grep`
- Read, Grep — spec.json, 테스트 파일
- Write — 보고서
- Bash — `gh pr label`, `gh issue create`
- Agent — code-simplifier subagent 로 fix 제안

## Guardrails (구현 시)

- **자동 fix 금지**. 실패 발견 시 보고만. 수정은 사용자 또는 harness agent.
- **노션 토큰 의존 회피**. prebuild 는 `sync:if-needed` 게이트라 커밋 데이터가 있으면 토큰 불필요 (ADR-030) — qa-runner 는 커밋된 `data/portfolio.fallback.json` 또는 `data/portfolio.sample.json` 만 사용, sync 를 트리거하지 않는다.
- **flaky test 자동 재실행 ≤ 2회**. 무한 retry 금지 (CI 비용).
- **회귀 라벨 신중**. 첫 통과 이력이 없는 신규 테스트의 실패는 회귀 아님. main 의 마지막 통과 commit 과 비교.
- **시크릿/.env 본문 출력 금지**. 실패 stacktrace 에 환경변수 값이 들어가면 마스킹.

## 구현 로드맵

### Phase 1: Local test mapping (현재 작업 가능)
1. `spec.json`의 `testScenarios[].file` 경로 → vitest 파일 매핑 테이블 생성
2. `npm run test -- --reporter=json > qa-results.json` 로 구조화 출력
3. `scripts/qa-map.ts` — testScenarios[] ↔ 실제 테스트 결과 매핑 리포트 생성

### Phase 2: GitHub Actions 연동
- `.github/workflows/qa.yml` 추가
- Trigger: `pull_request` + `push to main`
- Steps: checkout → install → `MOCK_LLM=1 MOCK_NOTION=1 npm run test -- --reporter=json` → parse → comment on PR
- PR comment format: `✅ TS-01 통과 | ❌ TS-05 실패 (링크)`

### Phase 3: Regression detection
- Compare current run vs last passing run (store in `phases/qa-runs/`)
- Auto-label PR: `qa-pass` / `qa-fail` / `regression`
- Create GitHub Issue on regression with test name + stacktrace

## AC (구현 시)

```bash
# 구현 시 본 spec 을 별도 step 으로 분리 (Out of Scope of agents-md-foundation plan).
# 구현 시 검증할 AC 후보:
# 1. spec.json testScenarios[] 의 모든 TS-NN 이 실제 테스트 파일과 매핑
# 2. 변경 파일 기반 우선 실행이 전체보다 ≥ 50% 빠름
# 3. 회귀 감지 false positive 0건 (main 통과 이력 정확)
# 4. CI runtime ≤ 5분 (P95)
```

## 구현 우선순위 근거

- Phase 8/9 deployment 전 필수. 운영 단계에서 회귀 발견 비용 ↑.
- 현재 `npm run check:spec` 가 spec 매핑은 검증하나, 실행 보고서·회귀 추적은 없음.
- 구현 비용: 중 (1-2 phase 예상). 보고서 generator + GitHub Actions workflow.

## Out of Scope (구현 시점에 결정)

- 시각 회귀 (Playwright screenshot diff) — 우선순위 별도
- 부하 테스트 (k6 등) — portfolio 규모에 과도
- chaos engineering — 무관
