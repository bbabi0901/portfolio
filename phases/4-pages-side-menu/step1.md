# Step 1: about-page

## 읽어야 할 파일

- `/CLAUDE.md` — 답변/콘텐츠는 `data/portfolio.server.json` 기반.
- `/docs/PAGES.md` — `/about` 와이어프레임 + 섹션 구조.
- `/docs/CONTENT_GUIDE.md` — 노션 화이트리스트 페이지 컨텐츠 가이드.
- `/docs/NOTION_SCHEMA.md` — `Profile` 페이지 청크 schema.
- `/docs/RESPONSIVE.md` — `/about` max-w-2xl, 프로필 이미지 모바일 96px / 데스크톱 128px.
- `/spec.json` — `pages[]` 의 `/about`, `features[]` FEAT-024 (자기소개 페이지).
- `/data/portfolio.sample.json` — 빌드 산출물 fallback. 서버 전용.
- `/lib/portfolio-data.ts` — 이전 task `1-content-pipeline` 의 server loader.
- `/types/portfolio.ts` — Chunk + Profile types.
- `/components/layout/LayoutClient.tsx` — 이전 step 의 layout.

## 작업

`/about` SSG 페이지. 노션 프로필 화이트리스트 페이지의 청크들을 섹션별로 렌더. reading-time 자동 계산. 프로필 이미지 SVG ini fallback.

### TDD 순서

1. `specs/components/about-page.spec.tsx` + `specs/about-data.spec.ts` 작성 (실패).
2. server-side 데이터 helper + 컴포넌트 + 페이지 구현 (통과).

### 생성할 파일

#### 1. `lib/profile-data.ts` (server-only loader)

```ts
import { loadPortfolio } from "./portfolio-data";

export interface ProfileSection {
  heading: string;            // H2
  subSections: Array<{        // H3 (옵션)
    heading?: string;
    body: string;             // markdown
  }>;
  reading?: { minutes: number; words: number };
}

export interface ProfileData {
  intro: string;              // 한 줄 소개 (이력서 About Me)
  sections: ProfileSection[]; // 가치관, MBTI/성격, 취미, 추가 섹션
  imageUrl: string | null;    // 프로필 이미지 (없으면 SVG fallback)
  totalReadingMinutes: number;
}

/**
 * 노션 프로필 화이트리스트 페이지의 청크들을 섹션별로 그룹화.
 * - heading depth 1 (H1) 은 페이지 제목 → intro 로 간주 (또는 h1 무시 + 본문 첫 줄).
 * - heading depth 2 (H2) → sections[]
 * - heading depth 3 (H3) → subSections[]
 * - 코드블록은 그대로 보존.
 *
 * @returns null  데이터 없거나 화이트리스트 페이지 없음 → 페이지가 placeholder 표시.
 */
export function loadProfileData(): ProfileData | null;

export function calculateReadingMinutes(body: string): { minutes: number; words: number };
```

- `data/portfolio.server.json` 의 `chunks` 중 `category === "profile"` (또는 sourceTitle 매칭) 만 추출.
- 단어 수: 한국어는 글자수/2, 영어는 공백 기준. minutes = ceil(words / 200).

#### 2. `components/about/AboutHero.tsx`

```tsx
import Image from "next/image";

export interface AboutHeroProps {
  intro: string;
  imageUrl: string | null;
  ownerName?: string;          // 기본 "김윤수"
  totalReadingMinutes: number;
}
export function AboutHero(props: AboutHeroProps): JSX.Element;
```

- `imageUrl` 없으면 SVG fallback: 이니셜 (한글 first char) on neutral-800 circle, lime-300 border.
- next/image 사용. 모바일 96px / 데스크톱 128px (`md:` breakpoint).
- 한 줄 소개 + "약 X분 읽기" badge.

#### 3. `components/about/AboutSection.tsx`

```tsx
export interface AboutSectionProps {
  heading: string;
  subSections: Array<{ heading?: string; body: string }>;
  className?: string;
}
export function AboutSection(props: AboutSectionProps): JSX.Element;
```

- H2 + sub h3 + react-markdown body.
- prose-invert + prose-sm + max-w-none (parent 가 max-w-2xl).
- 외부 link target=_blank rel=noopener noreferrer.

#### 4. `app/about/page.tsx` (server component, SSG)

```tsx
import type { Metadata } from "next";
import { loadProfileData } from "@/lib/profile-data";
import { AboutHero } from "@/components/about/AboutHero";
import { AboutSection } from "@/components/about/AboutSection";

export const metadata: Metadata = {
  title: "자기소개",
  description: "프론트엔드 개발자 김윤수의 가치관, 성격, 취미.",
};

export default function AboutPage() {
  const profile = loadProfileData();
  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 md:px-6 lg:px-8 py-12">
        <p className="text-neutral-400">자기소개 페이지가 준비 중입니다.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl px-4 md:px-6 lg:px-8 py-12 space-y-8">
      <AboutHero intro={profile.intro} imageUrl={profile.imageUrl} totalReadingMinutes={profile.totalReadingMinutes} />
      {profile.sections.map((s) => <AboutSection key={s.heading} {...s} />)}
    </main>
  );
}
```

- SSG default. `dynamic = "force-static"` 명시 가능.
- 빌드 시 portfolio.server.json 이 없으면 placeholder 렌더 + 빌드는 성공.

### Specs (TDD red)

```ts
// specs/about-data.spec.ts
import { describe, it, expect, vi } from "vitest";

describe("loadProfileData", () => {
  it("프로필 청크 없음 → null", () => { /* mock empty portfolio */ });
  it("청크 있음 → intro + sections 그룹화", () => { /* … */ });
  it("H3 → subSections 로 그룹화", () => { /* … */ });
  it("totalReadingMinutes = sum(sections)", () => { /* … */ });
});

describe("calculateReadingMinutes", () => {
  it("한국어 200글자 → 1분", () => { /* … */ });
  it("영어 200단어 → 1분", () => { /* … */ });
  it("빈 문자열 → 0분", () => { /* … */ });
});
```

```tsx
// specs/components/about-page.spec.tsx
describe("AboutHero", () => {
  it("imageUrl null → SVG initial fallback", () => { /* … */ });
  it("imageUrl 있음 → next/image src", () => { /* … */ });
  it("'약 X분 읽기' 표시", () => { /* … */ });
});

describe("AboutSection", () => {
  it("heading 렌더", () => { /* … */ });
  it("subSections markdown 렌더", () => { /* … */ });
  it("외부 link rel=noopener", () => { /* … */ });
});
```

E2E (선택, 후속 task `7-e2e-deploy` 에서 보강):
- `/about` 직접 접근 → 200 + Header/Footer/SideSheet 트리거 정상.

### 핵심 규칙 (위반 금지)

- **server component default** (`app/about/page.tsx`). 클라이언트 인터랙션 0. AboutHero/AboutSection 도 server component (next/image 만).
- **노션 콘텐츠 부재 시 placeholder**. 빌드 실패 X.
- **외부 link 항상 target=_blank rel=noopener noreferrer**.
- **react-markdown rehype-raw 금지** (XSS).
- **next/image 의 src 가 외부 도메인이면 next.config.ts 의 images.remotePatterns 등록 필요.** 노션 image url 패턴 추가 시 등록. 또는 fallback 으로 outsource → 보존.

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
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/about    # 200
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `app/about/page.tsx`, `lib/profile-data.ts`, `components/about/*` 존재.
   - 빈 데이터 케이스도 placeholder 정상.
   - 모든 spec 통과.
3. `phases/4-pages-side-menu/index.json` step 1 갱신.

## 금지사항

- **`/api/*` 호출 금지.** 이유: SSG.
- **client component 추가 금지.** 이유: 정적 페이지.
- **`useState`, `useEffect` 사용 금지** (이 step 의 페이지/컴포넌트). server-only.
- **노션 SDK 직접 호출 금지** (이 step). loadProfileData 는 portfolio.server.json 만 사용.
- **이미지 외부 fetch 금지.** next/image 만.
