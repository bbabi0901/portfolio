# Step 3: seo-meta

## 읽어야 할 파일

- `/CLAUDE.md` — `<html lang="ko">`, theme-color #0a0a0a.
- `/docs/SEO_POLICY.md` — title/description/OG/sitemap/robots/JSON-LD 정책.
- `/spec.json` — `pages[]` (각 페이지 title/description), `features[]` FEAT-019 (SEO/OG).
- `/app/layout.tsx`, `/app/page.tsx`, `/app/about/page.tsx`, `/app/experience/page.tsx`, `/app/contact/page.tsx` — 이전 task 산출물.
- `/app/sitemap.ts`, `/app/robots.ts`, `/app/opengraph-image.tsx` — 이전 task `4-pages-side-menu`.
- `/components/seo/JsonLdPerson.tsx` — 이전 task.

## 작업

페이지별 metadata 정밀 보강 + Lighthouse SEO 95+ 준비. JSON-LD 회귀.

### TDD 순서

1. `specs/seo-meta.spec.ts` 작성 (실패 또는 회귀 검증).
2. metadata 보강 (통과).

### 변경 파일

#### 1. `app/layout.tsx` 의 `metadata` 보강

```tsx
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "김윤수 — AI Portfolio",
    template: "%s | 김윤수",
  },
  description: "프론트엔드 개발자 김윤수에게 직접 물어보세요. 노션 기록 기반의 대화형 포트폴리오.",
  applicationName: "김윤수 AI Portfolio",
  authors: [{ name: "김윤수", url: "https://github.com/YoonsooKim9" }],
  creator: "김윤수",
  keywords: ["프론트엔드", "포트폴리오", "Next.js", "Web3", "Module Federation", "김윤수"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: "김윤수 — AI Portfolio",
    title: "김윤수 — AI Portfolio",
    description: "프론트엔드 개발자 김윤수에게 직접 물어보세요.",
    /* images 는 app/opengraph-image.tsx 가 자동 처리. images 명시적 필드 X. */
  },
  twitter: {
    card: "summary_large_image",
    title: "김윤수 — AI Portfolio",
    description: "프론트엔드 개발자 김윤수에게 직접 물어보세요.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: {
    icon: "/favicon.ico",          // 부재 시 별도 추가
  },
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};
```

#### 2. 페이지별 metadata (각 page 의 `export const metadata`):

- **`app/page.tsx`** (chat):
  ```ts
  export const metadata: Metadata = {
    title: "대화",
    description: "김윤수에게 직접 물어보세요. 노션 기록 기반 답변.",
    alternates: { canonical: "/" },
  };
  ```
- **`app/about/page.tsx`**:
  ```ts
  export const metadata: Metadata = {
    title: "자기소개",
    description: "프론트엔드 개발자 김윤수의 가치관, 성격, 취미.",
    alternates: { canonical: "/about" },
  };
  ```
- **`app/experience/page.tsx`**:
  ```ts
  export const metadata: Metadata = {
    title: "기술 이력",
    description: "김윤수의 회사·프로젝트 타임라인 + 보유 스킬.",
    alternates: { canonical: "/experience" },
  };
  ```
- **`app/contact/page.tsx`**:
  ```ts
  export const metadata: Metadata = {
    title: "연락하기",
    description: "김윤수에게 메시지를 남기거나 메일로 직접 연락하세요.",
    alternates: { canonical: "/contact" },
  };
  ```
- **`app/not-found.tsx`** (이미 robots index:false 적용).

#### 3. `app/opengraph-image.tsx` 의 alt + 폰트 안정화

기본 시스템 폰트 fallback 으로 한국어 OS 환경 보장. 폰트 import 가 가능하면 (Pretendard subset) 추가, 실패 시 system-ui 만.

#### 4. `components/seo/JsonLdPerson.tsx` 보강

```tsx
export function JsonLdPerson() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "김윤수",
    alternateName: "Yoonsoo Kim",
    jobTitle: "프론트엔드 개발자",
    description: "프론트엔드 + 스마트컨트랙트 개발자",
    email: "mailto:bbabi0901@gmail.com",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    sameAs: [
      "https://github.com/YoonsooKim9",
      // "https://www.linkedin.com/in/...",   // 사용자 정보 채워질 때 추가
    ],
    knowsAbout: [
      "Frontend Development",
      "TypeScript", "React", "Next.js",
      "Module Federation", "Smart Contracts", "Solidity",
    ],
  };
  return (
    <script type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
```

### Specs (TDD red)

```ts
// specs/seo-meta.spec.ts
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import RootLayoutMetadata from "@/app/layout";   // metadata export 사용
import HomeMetadata from "@/app/page";

describe("page metadata", () => {
  it("layout.title.template '%s | 김윤수'", () => { /* import metadata 후 검증 */ });
  it("layout.description 한국어", () => { /* … */ });
  it("/about title '자기소개'", () => { /* … */ });
  it("/experience title '기술 이력'", () => { /* … */ });
  it("/contact title '연락하기'", () => { /* … */ });
  it("layout.viewport.themeColor #0a0a0a", () => { /* … */ });
  it("layout.viewport.colorScheme 'dark'", () => { /* … */ });
  it("layout.alternates.canonical '/'", () => { /* … */ });
  it("layout.openGraph.locale 'ko_KR'", () => { /* … */ });
  it("layout.twitter.card 'summary_large_image'", () => { /* … */ });
});

describe("JsonLdPerson", () => {
  it("@type Person + sameAs github", () => { /* renderToString → JSON.parse */ });
  it("knowsAbout 배열 3개 이상", () => { /* … */ });
  it("dangerouslySetInnerHTML 외 다른 dom 없음 (단일 script tag)", () => { /* … */ });
});

describe("sitemap", () => {
  it("4 routes 포함 (/, /about, /experience, /contact)", () => { /* … */ });
  it("base URL 이 NEXT_PUBLIC_SITE_URL 사용", () => { /* … */ });
});

describe("robots", () => {
  it("disallow /api/, /api/node/", () => { /* … */ });
  it("sitemap URL 포함", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **JSON-LD 외 dangerouslySetInnerHTML 금지.**
- **OG image src 외부 도메인 추가 금지** (Edge runtime 호환).
- **canonical URL 은 path 만**. 절대 URL 은 metadataBase 자동.
- **robots index:true 는 production 만**. development 자동 noindex 는 Next 가 처리 안 하지만, NEXT_PUBLIC_SITE_URL 미설정 (= localhost) 시 search engine 이 무시.
- **사용자 PII 추가 금지** (전화번호, 주소).

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
curl -sS http://localhost:3000/sitemap.xml | head -20
curl -sS http://localhost:3000/robots.txt
curl -sS -I http://localhost:3000/opengraph-image | head -5
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - 5 페이지 metadata 정확.
   - sitemap 4 routes.
   - JSON-LD 검증 (https://validator.schema.org/ — 수동 옵션).
   - 모든 spec 통과.
3. `phases/6-guards-seo/index.json` step 3 갱신.

## 금지사항

- **GA / GTM 추가 금지.** MVP 외.
- **`<meta name="google-site-verification">` 추가 금지.** 사용자 console 등록 후 별도 작업.
- **OG image 동적 생성에 외부 image fetch 금지.**
- **Lighthouse CI workflow 추가 금지.** 후속 step 4.
- **page 별 metadata.openGraph.images 명시 금지** (layout 의 자동 OG image 사용).
