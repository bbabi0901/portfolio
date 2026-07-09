# SEO Policy

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, PRD.md, NOTION_SCHEMA.md, PAGES.md
**SSoT keys**: (없음 — SEO 정책 자체)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

## 사이트 정보
- 사이트명: **Yoonsoo Kim — AI Portfolio**
- 기본 URL: `https://yoonsoo.dev` (배포 후 확정)
- lang: `ko`
- color-scheme: `dark only`
- locale: `ko_KR`

## 메타데이터 정책 (Next 16 `metadata` export)

각 페이지는 라우트 파일에서 `metadata` 또는 `generateMetadata`를 export한다.

### 공통 (app/layout.tsx)
```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://yoonsoo.dev"),
  title: { default: "김윤수 — AI Portfolio", template: "%s — Yoonsoo Kim" },
  description: "프론트엔드 개발자 김윤수에게 직접 물어보세요. 노션 기록 기반의 대화형 포트폴리오.",
  keywords: ["김윤수", "프론트엔드", "Next.js", "Web3", "포트폴리오", "AI", "Module Federation"],
  authors: [{ name: "김윤수", url: "https://yoonsoo.dev" }],
  creator: "김윤수",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Yoonsoo Kim — AI Portfolio",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@yoonsoo (있으면)",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico", apple: "/apple-icon.png" },
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};
```

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

## OG 이미지 (FEAT-019)

- 동적 생성: `app/opengraph-image.tsx` (Next 16 ImageResponse).
- 크기: 1200×630.
- 디자인:
  - 배경 #0a0a0a
  - 좌상단에 "Yoonsoo Kim" (Pretendard SemiBold 80px white)
  - 그 아래 한 줄 소개 (suggestions.json의 `profile.headline`, neutral-400 32px)
  - 우하단에 lime-300 dot + URL "yoonsoo.dev"
- fallback: `/og-fallback.png` (정적 PNG, 빌드 산출물 또는 사전 커밋).

## robots.txt (`app/robots.ts`)

```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/_next/", "/private/"] },
    ],
    sitemap: "https://yoonsoo.dev/sitemap.xml",
  };
}
```

## sitemap.xml (`app/sitemap.ts`)

```ts
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://yoonsoo.dev";
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
  "url": "https://yoonsoo.dev",
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
