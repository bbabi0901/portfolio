# SEO Policy

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, PRD.md, NOTION_SCHEMA.md, PAGES.md
**SSoT keys**: (없음 — SEO 정책 자체)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

## 사이트 정보
- 사이트명: **김윤수 — AI Portfolio**
- 기본 URL: `https://yoonsoo.kirico.xyz` (Vercel `NEXT_PUBLIC_SITE_URL`, 2026-07 확정)
- lang: `ko`
- color-scheme: `light dark` (2026-07 라이트/다크 테마 도입, FEAT 테마 참조)
- locale: `ko_KR`

## 메타데이터 정책 (Next 16 `metadata` export)

각 페이지는 라우트 파일에서 `metadata` 또는 `generateMetadata`를 export한다.

### 공통 (app/layout.tsx)
```ts
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "김윤수 — AI Portfolio", template: "%s | 김윤수" },
  description: "프론트엔드 개발자 김윤수에게 직접 물어보세요. 노션 기록 기반의 대화형 포트폴리오.",
  keywords: ["프론트엔드", "포트폴리오", "Next.js", "Web3", "Module Federation", "김윤수"],
  authors: [{ name: "김윤수", url: "https://github.com/YoonsooKim9" }],
  creator: "김윤수",
  openGraph: { type: "website", locale: "ko_KR", url: "/", siteName: "김윤수 — AI Portfolio", ... },
  twitter: { card: "summary_large_image", ... },
  robots: { index: true, follow: true },
  // openGraph.images / twitter.images / icons 는 명시하지 않는다 —
  // app 디렉터리 파일 규약(opengraph-image.tsx, icon.tsx, apple-icon.tsx, favicon.ico)이
  // 라우트별 <meta>/<link> 를 자동 주입 (specs/seo-meta.spec.ts 가 "명시 없음"을 검증).
};
// themeColor/colorScheme 은 viewport export — 라이트 #ffffff / 다크 #0a0a0a 쌍.
```

## Favicon (FEAT-019, TS-86)

- **디자인**: 모노그램 "K" — 다크 `#0a0a0a` 배경 + 흰색 K(700) + 우하단 라임 점(`#bef264`).
- **구현**: 코드 생성 (`ImageResponse`, `dynamic = "force-static"`).
  - `app/icon.tsx` 32×32 png · `app/apple-icon.tsx` 180×180 png
  - `app/favicon.ico` — 정적 커밋 (레거시 브라우저/크롤러의 `/favicon.ico` 직접 요청 대응, `/icon` PNG를 png-to-ico 변환)
- `<link rel="icon">`/`<link rel="apple-touch-icon">` 은 Next 파일 규약이 자동 주입 — layout `icons` 필드 사용 금지.

### 페이지별

#### `/` (랜딩, FEAT-034)
- title: 기본 ("김윤수 — AI Portfolio")
- description: "프론트엔드 개발자 김윤수의 대화형 포트폴리오. 무엇이든 물어보세요."

#### `/chat` (대화 — 기존 `/` 에서 이전)
- title: "대화"
- description: "김윤수에게 직접 물어보세요. 노션 기록 기반 답변."
- canonical: /chat · sitemap 포함 (총 5개 라우트)

#### `/about`
- title: "자기소개"
- description: "프론트엔드 개발자 김윤수의 가치관, 성격, 취미."

#### `/experience`
- title: "커리어"
- description: "디라티오, 체인아나토미, 반에프에서의 프로젝트 타임라인과 보유 스킬."

#### `/contact`
- title: "연락하기"
- description: "프로젝트 협업 또는 채용 관련 문의를 남겨주세요."

#### `/not-found`
- title: "페이지를 찾을 수 없어요"
- robots: noindex, nofollow

## OG 이미지 (FEAT-019, TS-87 — 2026-07 페이지별 카드 개편)

- **공용 빌더**: `lib/og-card.tsx` `ogCard({ title, subtitle })` → `ImageResponse` 1200×630.
- **라우트별 카드** (각 세그먼트의 `opengraph-image.tsx`가 빌더에 위임, twitter 카드는 자동 재사용):
  - `/` "김윤수 — AI Portfolio" · `/chat` "AI 채팅" · `/about` "자기소개" · `/experience` "커리어" · `/contact` "연락하기"
- **디자인**: 배경 `#0a0a0a` · 좌상단 라임 점(`#bef264`) + "김윤수 — AI Portfolio" 라벨 · 중앙 좌측 페이지 타이틀(Pretendard SemiBold 76px) + 서브타이틀(Regular 30px `#a3a3a3`) · 우측 원형 프로필 사진(`public/images/profile.jpg`) · 좌하단 `yoonsoo.kirico.xyz`.
- **런타임**: Node + `dynamic = "force-static"` (빌드 타임 생성). **Edge 금지** — 한글 폰트 자산이 Edge 1MB 한도 초과 (ADR-033).
- **폰트**: `assets/fonts/Pretendard-{SemiBold,Regular}.woff` 커밋 자산 (satori는 woff2 미지원, SIL OFL·LICENSE 동봉). 서버 전용 — 클라이언트 번들 미포함.
- fallback `/og-fallback.png` (EC-28): force-static 이라 빌드 실패 시 배포 자체가 차단됨 — 별도 정적 fallback 미구현 (백로그).

## robots.txt (`app/robots.ts`)

```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/_next/", "/private/"] },
    ],
    sitemap: "https://yoonsoo.kirico.xyz/sitemap.xml",
  };
}
```

## sitemap.xml (`app/sitemap.ts`)

```ts
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://yoonsoo.kirico.xyz";
  const lastModified = new Date(); // portfolio.server.json generatedAt 사용 가능
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/about`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/experience`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/contact`, lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];
}
```

## JSON-LD `Person` 스키마

`app/layout.tsx`에 다음 스크립트 삽입 (RSC):

```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "김윤수",
  "alternateName": "Yoonsoo Kim",
  "url": "https://yoonsoo.kirico.xyz",
  "jobTitle": "Frontend Developer / Smart Contract Engineer",
  "worksFor": { "@type": "Organization", "name": "디라티오" },
  "alumniOf": [
    { "@type": "EducationalOrganization", "name": "고려대학교 신소재공학부" },
    { "@type": "EducationalOrganization", "name": "코드스테이츠 BEB 7기" }
  ],
  "sameAs": [
    "https://github.com/YoonsooKim9",
    "mailto:bbabi0901@gmail.com"
  ]
})}} />
```

## 검증 (CI)

- TS-63: 각 페이지 head를 fetch → title/description/OG/twitter/canonical 존재 확인.
- `/sitemap.xml` 200 + 4 url 포함.
- `/robots.txt` 200 + sitemap 라인 포함.
- `/opengraph-image` 200 + Content-Type image/png.
- JSON-LD 파싱 성공 + `@type: Person`.

## 주의
- 메타에 비공개 정보(전화번호, 이메일 직접 노출) 넣지 않는다 — JSON-LD `mailto:`는 OK(이미 이력서에 공개).
- robots `Disallow: /api/`로 LLM API 라우트가 외부 검색에 노출되지 않게.
- 동적 OG 빌드 실패 → 정적 fallback PNG 응답.
