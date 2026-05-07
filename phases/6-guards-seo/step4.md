# Step 4: error-503-page-lhci

## 읽어야 할 파일

- `/CLAUDE.md` — `MAX_TOKENS_PER_DAY` 초과 시 사이트 전체 503.
- `/spec.json` — `errorPolicies[]` ERR-16 (일별 토큰 한도 초과 → 503), FEAT-019 (SEO/OG), FEAT-012 (모니터링).
- `/lib/token-budget.ts` — 이전 step 2.
- `/app/page.tsx` ~ `/app/contact/page.tsx` — 페이지들.
- `/.github/workflows/ci.yml` — 이전 task 의 build-test job (Lighthouse 미포함).

## 작업

`/app/maintenance/page.tsx` (503 페이지) + Lighthouse CI workflow 추가. 페이지/라우트가 토큰 한도 초과 감지 시 503 응답 + 사용자에게 친절한 안내. Lighthouse CI Performance/A11y/Best Practices/SEO ≥90/95/95/95 보장.

### TDD 순서

1. `specs/maintenance-page.spec.tsx` + `specs/lhci-config.spec.ts` 작성 (실패).
2. 구현 (통과).

### 변경 파일

#### 1. `app/maintenance/page.tsx`

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "잠시 후 다시 만나요",
  description: "오늘 너무 많은 분이 와주셨어요. 내일 다시 만나요.",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="mx-auto flex h-[100dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-medium text-neutral-200">오늘은 너무 많은 분이 와주셨어요.</h1>
      <p className="text-neutral-400">내일 다시 만나요!</p>
      <a href="mailto:bbabi0901@gmail.com" className="text-sm text-neutral-300 underline hover:text-white">
        직접 메일로 연락하기
      </a>
    </main>
  );
}
```

- 503 응답 자체는 라우트가 status 503 으로 응답. 이 페이지는 사용자가 chat 503 받았을 때 client UI 가 안내 노출 또는 redirect 옵션. 단순 페이지로 두고, ChatRoot 의 ErrorState 가 이 페이지로 link.

#### 2. `components/chat/ErrorState.tsx` 보강 (이전 task 산출물)

기존 ErrorState 에 `kind === "token-budget"` 분기 추가. ChatRoot 에서 503 응답에 X-Reason: "token-budget" 또는 body `error: "token_budget_exceeded"` 시 적절한 메시지 + `/maintenance` link.

```tsx
// 단순 분기:
if (error?.kind === "token-budget") {
  return (
    <div className="...">
      <p>오늘 너무 많은 분이 와주셨어요.</p>
      <Link href="/maintenance">자세히</Link>
    </div>
  );
}
```

#### 3. `lib/log.ts` (옵션, FEAT-012 구조화 로그)

```ts
export interface ApiLogContext {
  ts: string;
  route: string;
  ipHash: string;
  model?: string;
  retrievalMode?: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  status: number;
}

/** JSON line 으로 stdout 출력. Vercel logs 가 자동 수집. */
export function logApi(ctx: ApiLogContext): void;
```

- chat / feedback / contact 라우트 끝에서 호출.
- token, key, IP raw 절대 포함 X.

#### 4. `.github/workflows/lhci.yml`

```yaml
name: Lighthouse CI

on:
  pull_request:
    branches: [main]

jobs:
  lhci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    if: ${{ false }}    # TODO(post-mvp): 실제 deploy URL 가 안정될 때 활성화. 일단 skeleton.
    env:
      NEXT_TELEMETRY_DISABLED: "1"
      SKIP_NOTION_SYNC: "1"
      MOCK_LLM: "1"
      MOCK_NOTION: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: "npm"
      - run: npm ci
      - run: npm run build
      - run: npm run start &
      - run: sleep 8
      - name: LHCI assert
        uses: treosh/lighthouse-ci-action@v12
        with:
          urls: |
            http://localhost:3000/
            http://localhost:3000/about
            http://localhost:3000/experience
            http://localhost:3000/contact
          uploadArtifacts: true
          temporaryPublicStorage: true
          configPath: ./.lighthouserc.json
```

#### 5. `.lighthouserc.json`

```json
{
  "ci": {
    "collect": { "numberOfRuns": 1 },
    "assert": {
      "preset": "lighthouse:no-pwa",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.90 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.95 }],
        "categories:seo": ["error", { "minScore": 0.95 }]
      }
    }
  }
}
```

#### 6. `package.json` scripts:
- `"lhci": "lhci autorun"` (선택, dev 환경에서 수동 실행).

### Specs (TDD red)

```tsx
// specs/maintenance-page.spec.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MaintenancePage from "@/app/maintenance/page";

describe("MaintenancePage", () => {
  it("렌더 + 친절 메시지 + mailto link", () => { /* … */ });
  it("metadata.robots index:false", () => { /* … */ });
});
```

```ts
// specs/lhci-config.spec.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe(".lighthouserc.json", () => {
  it("performance >= 0.90", () => {
    const cfg = JSON.parse(fs.readFileSync(".lighthouserc.json", "utf-8"));
    expect(cfg.ci.assert.assertions["categories:performance"][1].minScore).toBeGreaterThanOrEqual(0.90);
  });
  it("a11y/best-practices/seo >= 0.95", () => { /* … */ });
});

describe(".github/workflows/lhci.yml", () => {
  it("YAML 문법 OK", () => {
    /* python3 yaml.safe_load 또는 js-yaml */
  });
  it("if:false 로 disable 되어 있음 (post-mvp)", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **maintenance 페이지는 robots index:false.**
- **lhci.yml 은 일단 disable** (`if: false`). 이유: deploy URL 안정 후 활성화 (빈 스켈레톤 + 정책 정의만).
- **lighthouserc.json 의 임계값을 임의 낮추기 금지** (사용자 명시 P/A/BP/SEO = 90/95/95/95).
- **log.ts 는 stdout JSON 만.** 외부 SaaS (Sentry, Datadog) 호출 금지 (MVP 외).
- **structured log 에 사용자 입력 raw 포함 금지.**

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/lhci.yml'))"
```

수동:
```bash
npm run dev &
sleep 5
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/maintenance   # 200 (자체 페이지)
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `app/maintenance/page.tsx`, `lib/log.ts`, `.github/workflows/lhci.yml`, `.lighthouserc.json` 존재.
   - 모든 spec 통과.
   - lhci.yml 의 `if: false` skeleton 적용.
   - chat 라우트가 token cap 초과 시 503 + JSON `{ error: "token_budget_exceeded" }` 응답 (이전 step 2 와 통합).
3. `phases/6-guards-seo/index.json` step 4 갱신 (이 task 의 마지막 step).

## 금지사항

- **lhci 활성화 금지.** 이유: deploy URL 안정 후 별도 task.
- **외부 모니터링 SaaS 추가 금지.**
- **chat 503 응답에 정확 used 토큰 포함 금지.**
- **maintenance 페이지를 root layout 의 children 외부에 두지 마라.** 일관성.
- **403 redirect 같은 자동 라우팅 추가 금지.** 사용자가 명시적으로 maintenance 링크 누르기.
