# Testing Guide (TDD)

## 원칙
- **TDD**: 코드 변경 전에 실패 테스트를 작성한다. Red → Green → Refactor.
- **SDD 연계**: spec.json `features[].tests`에 명시된 테스트 파일이 실제 존재해야 한다. `npm run check:spec`이 검증.
- **외부 호출 결정성**: msw로 OpenAI/Anthropic/Google/Notion/Resend 모두 모킹. 실수로 실제 호출 시 테스트 fail.
- **테스트 시나리오 매핑**: docs/TEST_SCENARIOS.md의 `TS-XX`가 어느 파일에서 실행되는지 1:1 매핑 (spec.json `testScenarios[]`).

## 도구

| 도구 | 용도 |
|---|---|
| Vitest | 단위 + 통합 + 컴포넌트 테스트 (JSDOM 환경) |
| @testing-library/react + jest-dom | 컴포넌트 |
| msw | 외부 API 모킹 (`tests/msw/handlers.ts`) |
| Playwright | E2E + 시각 회귀 |
| axe-core (Playwright) | a11y 자동 검사 |

## 명명 규칙
- 단위/통합: `specs/*.spec.ts`
- 컴포넌트: `specs/*.spec.tsx`
- E2E: `tests/e2e/*.e2e.ts`
- 시각 회귀: `tests/visual/*.spec.ts`

## 디렉토리 구조

```
specs/
  chat-route.spec.ts           # /api/chat 통합
  feedback-route.spec.ts       # /api/feedback 통합
  contact-route.spec.ts        # /api/contact 통합
  retriever.spec.ts            # 하이브리드 검색 단위
  prompts.spec.ts              # 시스템 프롬프트 빌더
  models.spec.ts               # 모델 화이트리스트, 폴백
  injection-defense.spec.ts    # INJ-01~05
  output-postprocess.spec.ts   # 외부 URL 마스킹 등
  spec-schema.spec.ts          # spec.json zod
  side-sheet.spec.tsx          # 사이드 메뉴 컴포넌트
  greeting-player.spec.tsx     # 첫 인사 시뮬레이터
  contact-form.spec.tsx        # 폼 검증
  carousel.spec.tsx            # 추천 질문 carousel
  responsive.spec.tsx          # matchMedia mock
  message-bubble.spec.tsx      # 버블 렌더, copy, 출처 chip
  composer.spec.tsx            # IME 3중 체크
  feedback-button.spec.tsx     # 중복 제출 방지
  reading-time.spec.ts         # About 페이지 reading-time
tests/
  msw/
    handlers.ts                # OpenAI/Anthropic/Google/Notion/Resend
    server.ts                  # node, browser
  e2e/
    chat.e2e.ts                # TS-01~22
    side-menu.e2e.ts           # TS-23~32
    about.e2e.ts               # TS-33~37
    experience.e2e.ts          # TS-38~42
    contact.e2e.ts             # TS-43~60
    cross-cutting.e2e.ts       # TS-61~70
  visual/
    breakpoints.spec.ts        # 6 디바이스 매트릭스
```

## 커버리지 목표
- `lib/`: branch ≥ 90%
- `services/`: branch ≥ 80%
- `components/chat/`: branch ≥ 70%
- 핵심 라우트(`/api/chat`, `/api/feedback`, `/api/contact`): line ≥ 90%

## TDD 워크플로우 예시

### 새 기능 FEAT-XYZ 추가 시
1. `spec.json` 수정 → `features[]`에 `FEAT-XYZ` 등록 (acceptanceCriteria, edgeCases, errorCases, tests).
2. `npm run check:spec` 실행 → tests 파일이 존재하지 않으면 즉시 fail.
3. 빈 테스트 파일 생성 (예: `specs/xyz.spec.ts`).
4. 첫 실패 테스트 작성 (Given/When/Then을 docs/TEST_SCENARIOS.md TS-XX 기반).
5. `npm run test:watch` 실행 → red 확인.
6. 최소 구현 → green.
7. Refactor.
8. 다음 AC로 반복.

## msw 핸들러 표준 (`tests/msw/handlers.ts`)

```ts
// OpenAI 채팅
http.post('https://api.openai.com/v1/chat/completions', ...)
// Anthropic 채팅
http.post('https://api.anthropic.com/v1/messages', ...)
// Google Generative AI
http.post('https://generativelanguage.googleapis.com/v1beta/models/:model:streamGenerateContent', ...)
// Notion API
http.post('https://api.notion.com/v1/pages', ...)         // append row
http.post('https://api.notion.com/v1/databases/:id/query', ...)
http.get('https://api.notion.com/v1/blocks/:id/children', ...)
// Resend
http.post('https://api.resend.com/emails', ...)
// OpenAI 임베딩 (sync-notion에서만)
http.post('https://api.openai.com/v1/embeddings', ...)
```

각 핸들러는 시나리오별 분기 (success / 4xx / 5xx / 429 / timeout) 가능.

## E2E 환경 (Playwright)

- `playwright.config.ts`:
  - `baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000'`
  - `webServer: { command: 'npm run start', port: 3000 }` (CI), 로컬은 `npm run dev` 직접 실행 후 테스트.
  - 디바이스 프리셋 6종 (iPhone SE, iPhone 14 Pro, Galaxy S23, iPad Mini, MacBook 13, 4K).
  - msw는 E2E에서 사용 안 함 — 실제 환경 유사하게 mock 서버를 별도 띄우거나, `MOCK_OPENAI=1` 같은 env로 라우트 내부에서 분기.

### E2E mock 전략
- 실제 API 호출 비용/불안정성 회피.
- `lib/models.ts`에 `MOCK_LLM=1`이면 더미 streamText 반환 (한국어 인사 기반 결정 응답).
- `services/notion.ts`에 `MOCK_NOTION=1`이면 in-memory 가짜 DB.
- CI는 항상 mock. 수동 검증만 실제.

## a11y 자동 검사

- 각 페이지 e2e 끝에 `axe.run()` (axe-playwright) 호출 → 위반 0건이어야 통과.
- 키보드만 시나리오: TS-61.
- 색 대비: TS-62 (axe).

## 시각 회귀 (Playwright Visual Comparison)

- `tests/visual/breakpoints.spec.ts`:
  - 6 디바이스 × 4 페이지 = 24 스냅샷.
  - 첫 베이스라인은 PR에서 사람이 검토.
  - 변경 시 `--update-snapshots` 플래그로 갱신.

## 성능 검증 (CI)

- `npm run lhci` (Lighthouse CI):
  - `/`: Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO ≥ 95
  - `/about`, `/experience`, `/contact` 동일.
- `npm run audit:bundle`:
  - 클라이언트 청크에 `(?:[-]?\d+\.\d+,){100,}` 같은 임베딩 패턴 0건.
  - gzipped JS < 250KB.

## 테스트 데이터

- `data/portfolio.sample.json`: 작은 fixture (3 청크, 18 질문, 1 profile). 모든 테스트는 이 sample을 import.
- 실제 노션 토큰은 테스트에서 사용 금지 (msw 또는 mock 모드).

## CI 파이프라인 (제안)

```
1. checkout
2. npm ci
3. npm run check:spec       # spec.json 검증
4. npm run lint
5. npm run test             # vitest
6. npm run audit:bundle
7. npm run build            # prebuild에 sync는 mock 모드로
8. npm run e2e              # Playwright (mock)
9. npm run lhci             # 성능
10. (PR만) visual regression 비교
```

CI 실패 시 머지 차단.
