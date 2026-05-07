# Step 4: routing-cross-cutting

## 읽어야 할 파일

- `/CLAUDE.md` — 모든 LLM 호출은 `/api/*` 만, 클라이언트는 같은 origin.
- `/docs/PAGES.md` — `/`, `/about`, `/experience`, `/contact`, `/not-found`.
- `/docs/SEO_POLICY.md` — title/description/OG/sitemap/robots/JSON-LD.
- `/spec.json` — `pages[]`, `features[]` FEAT-029 (라우팅 / 페이지 전환 UX), FEAT-019 (SEO/OG), FEAT-020 (푸터).
- 이전 step 의 `LayoutClient`, 페이지들.

## 작업

페이지 전환 UX 정리 + 메타데이터 보강 + `/not-found` + JSON-LD + sitemap/robots.

### TDD 순서

1. `specs/components/routing.spec.tsx` + `specs/seo.spec.tsx` 작성 (실패).
2. 구현 (통과).

### 생성/수정할 파일

#### 1. `app/not-found.tsx` (보강)

```tsx
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 md:px-6 lg:px-8 py-24 text-center">
      <h1 className="text-2xl font-medium text-neutral-200">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-neutral-400">아래 링크로 이동해 보세요.</p>
      <nav className="mt-6 flex justify-center gap-4 text-sm">
        <Link href="/" className="text-neutral-300 hover:text-white">대화</Link>
        <Link href="/about" className="text-neutral-300 hover:text-white">자기소개</Link>
        <Link href="/experience" className="text-neutral-300 hover:text-white">기술 이력</Link>
        <Link href="/contact" className="text-neutral-300 hover:text-white">연락하기</Link>
      </nav>
    </main>
  );
}
```

#### 2. `app/sitemap.ts`

```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const routes = ["/", "/about", "/experience", "/contact"];
  return routes.map((r) => ({ url: `${base}${r}`, lastModified: new Date() }));
}
```

#### 3. `app/robots.ts`

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/api/node/"] },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/sitemap.xml`,
  };
}
```

#### 4. `app/layout.tsx` 갱신 — JSON-LD Person schema

```tsx
import { JsonLdPerson } from "@/components/seo/JsonLdPerson";

// body 내 마지막에:
<JsonLdPerson />
```

```tsx
// components/seo/JsonLdPerson.tsx (server component)
export function JsonLdPerson() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "김윤수",
    jobTitle: "프론트엔드 개발자",
    email: "mailto:bbabi0901@gmail.com",
    sameAs: ["https://github.com/YoonsooKim9"],
  };
  return (
    <script type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
```

- JSON-LD 는 server inline. dangerouslySetInnerHTML 이 유일한 예외 (정적 JSON, XSS 위험 0).

#### 5. `app/opengraph-image.tsx` (동적 OG)

```tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "김윤수 — AI Portfolio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", background: "#0a0a0a",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        color: "white", fontSize: 64,
      }}>
        <div>김윤수 — AI Portfolio</div>
        <div style={{ fontSize: 24, color: "#a3a3a3", marginTop: 16 }}>
          노션 기록 기반 대화형 포트폴리오
        </div>
      </div>
    ),
    size
  );
}
```

- 빌드 실패 시 `app/opengraph-image-fallback.png` 정적 fallback (별도 file). 이 step 에서 fallback 추가는 옵션 (실패 케이스 거의 없음).

#### 6. 라우팅 cross-cutting (LayoutClient 보강)

기존 LayoutClient 의 SideSheet auto-close 외 추가:

##### a. 라우트 변경 시 chat in-flight abort

ChatRoot 가 `/` 페이지에서 mount 되어 useChat 를 사용. 사용자가 `/about` 등으로 이동 시 unmount → useChat의 fetch 자동 abort (React useEffect cleanup). 우리가 **추가로** 할 필요 없음. 다만 사용자에게 "응답을 중단했어요" toast 는 silent (옵션).

이 step 에서는 검증만:

```tsx
// specs/components/routing.spec.tsx
it("ChatRoot unmount 시 useChat abort + 부수효과 없음", () => { /* … */ });
```

##### b. 라우트 변경 시 scroll top

```tsx
// LayoutClient 또는 별도 component
"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ScrollToTopOnRouteChange() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
```

LayoutClient 안에 mount.

##### c. Cmd/Ctrl+클릭 새 탭 — Next.js `<Link>` 가 기본 지원. 별도 작업 없음. 검증만.

#### 7. 페이지별 metadata 검토

- `/` (chat): 이미 `app/page.tsx` server. metadata 추가:
  ```ts
  export const metadata = { title: "대화", description: "김윤수에게 직접 물어보세요." };
  ```
- `/about`: 이미 step 1.
- `/experience`: 이미 step 2.
- `/contact`: 이미 step 3.

`app/layout.tsx` 의 `metadata.title.template` (`"%s | 김윤수"`) 가 자동 적용 → 페이지별 title prefix.

### Specs (TDD red)

```tsx
// specs/components/routing.spec.tsx
describe("ScrollToTopOnRouteChange", () => {
  it("pathname 변경 → window.scrollTo 호출", () => { /* … */ });
});

describe("LayoutClient 라우트 cross-cutting", () => {
  it("/ → /about 이동 시 SideSheet auto-close", async () => { /* … */ });
  it("페이지 직접 진입 시 SideSheet 닫힘 상태", () => { /* … */ });
});
```

```ts
// specs/seo.spec.ts (Node)
describe("sitemap", () => {
  it("4 routes 포함 (/, /about, /experience, /contact)", () => { /* … */ });
  it("각 url 이 NEXT_PUBLIC_SITE_URL 사용", () => { /* … */ });
});

describe("robots", () => {
  it("allow /, disallow /api/", () => { /* … */ });
  it("sitemap URL 포함", () => { /* … */ });
});

describe("JsonLdPerson", () => {
  it("@type Person, name 김윤수, sameAs github 링크 포함", () => {
    /* renderToStaticMarkup → JSON.parse */
  });
});
```

E2E (옵션 — 후속 task 에서):

```ts
test("/non-existent → 404 페이지 + 홈 링크", async ({ page }) => { /* … */ });
test("OG image /opengraph-image → 200 + image/png", async ({ request }) => { /* … */ });
```

### 핵심 규칙 (위반 금지)

- **JSON-LD 외 dangerouslySetInnerHTML 사용 금지.**
- **OG image 는 Edge runtime.** Node API 사용 X.
- **sitemap/robots 의 base URL 은 NEXT_PUBLIC_SITE_URL.** 미설정 시 localhost fallback (production deploy 시 vercel env 에 설정).
- **scroll top behavior: 'instant'.** 사용자가 같은 페이지 anchor 이동은 별개 — 우리는 pathname 변경에만 반응.
- **`router.refresh()` 호출 금지.** 이유: 서버 컴포넌트 강제 재렌더, SSG 의도와 충돌.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

수동:
```bash
npm run dev &
sleep 5
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/non-existent  # 404
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/sitemap.xml   # 200
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/robots.txt    # 200
curl -sS -I http://localhost:3000/opengraph-image | head -5                  # 200 + image/png
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `app/not-found.tsx`, `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx`.
   - `components/seo/JsonLdPerson.tsx`.
   - LayoutClient 의 ScrollToTopOnRouteChange + SideSheet auto-close 통합.
   - 페이지 metadata 모두 정의.
   - 모든 spec 통과.
3. `phases/4-pages-side-menu/index.json` step 4 갱신 (이 task 의 마지막 step).

## 금지사항

- **OG image 동적 생성에 외부 fetch 금지.** Edge runtime 안전.
- **router.events 사용 금지.**
- **JSON-LD 의 telephone, address 등 사적 정보 추가 금지** (이메일/GitHub만).
- **sitemap.xml 에 `/api/*` 포함 금지.** robots.txt 의 disallow 와 모순.
- **Google Tag Manager / Analytics 추가 금지.** MVP 외.
- **noscript 태그 추가 금지** (이미 SSR/SSG 라 노스크립트 페이지 자체 동작).
