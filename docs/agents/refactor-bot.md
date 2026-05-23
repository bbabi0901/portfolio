# Agent: refactor-bot (Virtual — 예정)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — Real 승격 시 자체 owner
**Related**: ../../AGENTS.md, ../../CLAUDE.md, ../UI_GUIDE.md, ../ARCHITECTURE.md, index.md
**SSoT keys**: (없음 — 골든 원칙을 코드와 대조)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
**Status**: 🟡 Virtual / 로드맵 — 우선순위 **하**
<!-- /agents-md-meta -->

> 본 agent 는 아직 구현되지 않음. OpenAI Harness Engineering 의 "golden principles + 자동 cleanup" 패턴. 본 프로젝트는 1인 portfolio 라 ROI 가 낮아 조기 도입 안 함.

## Role

코드베이스의 **골든 원칙 위반**을 정기 스캔하고 자동 fix PR 생성. OpenAI 의 "Friday cleanup → 자동화" 패턴.

본 프로젝트의 골든 원칙 후보:
- **parse-at-boundary**: 외부 데이터(`fetch` 응답, `JSON.parse`, `useChat` message) 는 반드시 zod 로 parse — `as` 단정 금지
- **no-any-type**: `any` 사용 금지 (TypeScript strict)
- **no-inline-secret**: 코드 내 토큰/키 문자열 0 (env var 만)
- **no-AI-slop**: `docs/UI_GUIDE.md` 의 안티패턴 (gradient-text, blur-3xl, "Powered by AI" 등) 0
- **layer-direction**: ARCHITECTURE.md 의 import 방향 (`components → lib → services`) 위반 0
- **time-zone**: 시간 표기 UTC 직접 사용 금지 (항상 KST — `Asia/Seoul`)

## Trigger (구현 시)

- weekly cron — 토요일 새벽 1회
- `/refactor-scan` 슬래시 명령 — 수동
- on-push (main) — 옵션 (CI 비용 고려)

## Inputs (구현 시)

- 전체 코드 (`app/`, `components/`, `lib/`, `services/`)
- `CLAUDE.md` — CRITICAL 규칙
- `docs/UI_GUIDE.md` — 안티패턴 목록
- `docs/ARCHITECTURE.md` — 디렉토리/import 규칙
- `tsconfig.json` — strict 설정

## Outputs (구현 시)

- 자동 PR `refactor/golden-principles-{week}` — 위반 항목별 최소 패치
- PR body — 위반 패턴 + 자동 수정 근거
- 사용자 1 클릭 머지 또는 reject
- 큰 변경은 PR 대신 issue (사용자 결정 영역)

## Tools (구현 시)

- Read, Grep — 위반 패턴 검색
- Edit — patch 생성
- Bash — `npm run lint`, `tsc --noEmit`, `git diff`
- Agent — code-simplifier subagent 로 fix 정리

## Guardrails (구현 시)

- **자동 수정 범위 제한**. 단순 치환 (`as any` 제거, `console.log` 삭제, 안티패턴 className 변경) 만. 로직 변경 0.
- **수정 단위 작게**. 단일 PR 에 ≤ 10 파일 변경. 큰 위반은 issue 만 — 사용자가 분할.
- **CRITICAL 규칙은 fix 하지 마라**. 클라이언트의 시크릿 노출 등은 issue 만. 자동 fix 시도하면 더 큰 사고.
- **테스트 영향 검증**. fix 후 `npm run test` 통과 안 하면 PR 생성 abort.
- **타입 좁히기 후 `as`** 같은 의도 추측 금지. 의도 모호하면 issue.
- **commit message 표준**: `refactor(golden): <원칙명> <count>건` — semantic.

## AC (구현 시)

```bash
# 구현 시 본 spec 을 별도 step 으로 분리 (Out of Scope of agents-md-foundation plan).
# 구현 시 검증할 AC 후보:
# 1. 위반 패턴 검출 정확도 ≥ 95% (false positive 5% 이하)
# 2. 자동 PR 의 lint+test 통과율 = 100%
# 3. 사용자 reject 비율 ≤ 20%
# 4. weekly runtime ≤ 10분 (P95)
```

## 구현 우선순위 근거 — 본 프로젝트는 도입 보류

- OpenAI 가 도입한 이유: 100만 줄 + 7명 → 매주 "AI slop" 누적 → 정원사 필요.
- 본 프로젝트: 1인 + 수천 줄 → 사용자가 직접 review 가능 범위.
- 도입 시점: 코드량 ≥ 50,000 줄 또는 협업자 ≥ 3명 일 때. 그 전엔 ROI 낮음.
- 그 전까지 `/review` (Real agent) + `npm run lint` + 사용자 손 리뷰로 충분.

## Out of Scope (구현 시점에 결정)

- 디자인 시스템 자동 보정 (Tailwind class → CVA variant 등) — 별도 phase, 우선순위 낮음
- 자동 의존성 업데이트 (Renovate/Dependabot) — 별도 도구 사용
- 자동 i18n (한국어/영어 분리) — 본 프로젝트는 한국어 only
