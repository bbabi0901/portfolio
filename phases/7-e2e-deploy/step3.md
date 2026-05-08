# Step 3: e2e-pages

## 읽어야 할 파일

- `/docs/TEST_SCENARIOS.md` — TS-33~60 (about / experience / contact 시나리오).
- `/spec.json` — `testScenarios[]` TS-33~60.
- `/app/about/page.tsx`, `/app/experience/page.tsx`, `/app/contact/page.tsx` + 관련 컴포넌트.
- `/lib/contact-schema.ts`.

## 작업

`/about`, `/experience`, `/contact` 페이지 e2e.

### 시나리오 매핑

#### About (TS-33~37)
- TS-33 페이지 직접 진입 200
- TS-34 노션 프로필 비어있는 placeholder
- TS-35 reading-time 자동 계산
- TS-36 이미지 fallback (SVG initial)
- TS-37 모바일 1컬럼 / 데스크톱 max-w-2xl (visual — step 4 visual baseline)

#### Experience (TS-38~42)
- TS-38 페이지 직접 진입
- TS-39 카테고리 필터 → URL `?category=업무` 동기화
- TS-40 빈 결과 빈 상태
- TS-41 "노션에서 자세히" → target=_blank
- TS-42 모바일 horizontal / 데스크톱 vertical sticky (visual — step 4)

#### Contact (TS-43~60)
- TS-43 페이지 직접 진입 + 폼 + 직접 연락 카드
- TS-44 정상 제출 → 토스트 + 폼 reset (mock notion 200)
- TS-45 빈 필드 인라인 에러
- TS-46 이메일 형식 위반
- TS-47 이름 길이 위반
- TS-48 메시지 길이 위반
- TS-49 honeypot 채워짐 → 200 silent (서버 200 → 클라이언트 토스트)
- TS-50 1.5초 미만 제출 → too_fast (또는 captcha 노출)
- TS-51 rate limit 429 (BYPASS=1 → skip)
- TS-52 Notion 5xx → mailto fallback 토스트
- TS-53 Resend 미설정 → 정상 흐름
- TS-54 NOTION_CONTACT_DB_ID 미설정 → 503 (env override 어려움 → skip 또는 mock)
- TS-55 autoComplete attribute
- TS-56 페이지 이탈 경고 (beforeunload)
- TS-57 이메일 + alias 통과
- TS-58 한국어 이름 통과
- TS-59 한글 이메일 검증 실패
- TS-60 모바일 키보드 가림 (visualViewport — visual)

### TDD 순서

각 페이지별 spec 파일 분리.

```
tests/e2e/pages/
  ├── about.e2e.ts        # TS-33~36
  ├── experience.e2e.ts   # TS-38~41
  └── contact.e2e.ts      # TS-43~52, 55~59
```

(TS-37/42/60 은 visual — step 4. TS-51/54 는 env 의존 → skip with reason.)

### 핵심 동작 예시

#### TS-39 Experience filter

```ts
test("TS-39: 카테고리 필터 → URL ?category= 동기화", async ({ page }) => {
  await page.goto("/experience");
  await page.locator("button", { hasText: "업무" }).click();
  await expect(page).toHaveURL(/\?category=%EC%97%85%EB%AC%B4|category=업무/);
  // 필터링된 카드 — 자체프로젝트 카테고리 카드 미렌더 검증.
});
```

#### TS-44 Contact 정상 제출

```ts
test("TS-44: 정상 제출 → 토스트 + reset", async ({ page }) => {
  await page.goto("/contact");
  // 1500ms 대기 (봇 임계 통과)
  await page.waitForTimeout(1600);
  await page.fill('input[name="name"]', "홍길동");
  await page.fill('input[name="email"]', "hong@example.com");
  await page.fill('textarea[name="message"]', "안녕하세요. 테스트 메시지입니다 (10자 이상).");
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('[role="status"]', { hasText: /받았어요/ })).toBeVisible({ timeout: 5000 });
  // reset
  await expect(page.locator('input[name="name"]')).toHaveValue("");
});
```

#### TS-49 Honeypot

```ts
test("TS-49: honeypot 채워짐 → silent 200 (저장 X)", async ({ page }) => {
  await page.goto("/contact");
  await page.waitForTimeout(1600);
  await page.fill('input[name="name"]', "BotTest");
  await page.fill('input[name="email"]', "bot@example.com");
  await page.fill('textarea[name="message"]', "스팸 메시지 텍스트입니다.");
  // honeypot 직접 채우기 (DOM 조작)
  await page.evaluate(() => {
    const input = document.querySelector('input[name="website"]') as HTMLInputElement;
    if (input) input.value = "http://spam.example.com";
  });
  await page.locator('button[type="submit"]').click();
  // 클라이언트 측 토스트 — server 200 silent → "받았어요" 토스트 표시 (UX 일관)
  // 또는 reset 동작.
});
```

### 핵심 규칙 (위반 금지)

- **mock 환경에서 Notion / Resend 모두 ok 응답** (글로벌 webServer env MOCK_NOTION=1).
- **TS-50 봇 임계** 시뮬레이션은 mount 후 즉시 submit.
- **autoComplete 검증은 input attribute 만**. 실제 자동완성 동작은 Playwright 가 emulate 못함.
- **beforeunload 경고는 Playwright 의 `dialog` 이벤트 또는 `page.on("dialog")` 로 감지**.
- **visualViewport 시뮬레이션 어려움** → TS-60 은 step 4 visual baseline 으로 미룸.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
npm run e2e -- --project="MacBook 13" tests/e2e/pages
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `tests/e2e/pages/{about,experience,contact}.e2e.ts` 존재.
   - 시나리오 통과 (TS-37/42/51/54/60 등은 명시적 skip + reason).
   - regress: chat / side-menu e2e 모두 통과.
3. `phases/7-e2e-deploy/index.json` step 3 갱신.

## 금지사항

- **chat / side-menu 시나리오 추가 금지** (회귀 외).
- **TS-50 의 captcha 자동 통과 금지.** 단순 422 too_fast 응답 검증으로 충분.
- **실제 outbound mail 발송 금지** — Resend mock.
- **honeypot 시뮬레이션 시 page.fill 사용 금지** (보이지 않는 element). evaluate 로 강제 set.
- **TS-XX 외 시나리오 임의 추가 금지.**
