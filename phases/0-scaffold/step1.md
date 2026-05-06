# Step 1: app-shell

## 읽어야 할 파일

먼저 아래 파일들을 읽고 설계 의도를 파악하라:

- `/CLAUDE.md` — 디자인 규칙 (다크 only, Pretendard, theme-color, lang=ko)
- `/docs/ARCHITECTURE.md` — `app/` 구조, Server Components 기본
- `/docs/UI_GUIDE.md` — 색상 토큰 (#0a0a0a, #141414, lime-300), 안티패턴
- `/docs/RESPONSIVE.md` — breakpoint, max-w, padding 표
- `/docs/SEO_POLICY.md` — title/description/OG 정책

이전 step에서 만들어진 파일:

- `/package.json` — 의존성과 scripts
- `/tsconfig.json` — paths `@/*`
- `/app/globals.css` — `@import "tailwindcss";` 한 줄

이전 step의 `package.json`/`tsconfig`/`postcss`/`eslint`를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라.

## 작업

App Router의 root layout, 빈 홈 placeholder, 404 페이지를 만든다. 채팅 UI는 후속 task에서 추가한다. 이 step은 다크 셸 + 폰트 + metadata만.

### 생성/수정할 파일

1. **`app/layout.tsx`** (Server Component)

   시그니처:
   ```ts
   import type { Metadata, Viewport } from "next";

   export const metadata: Metadata = {
     title: { default: "김윤수 — AI Portfolio", template: "%s | 김윤수" },
     description: "프론트엔드 개발자 김윤수에게 직접 물어보세요. 노션 기록 기반의 대화형 포트폴리오.",
     openGraph: { /* SEO_POLICY.md 참조 */ },
     twitter: { card: "summary_large_image" },
     metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
   };

   export const viewport: Viewport = {
     themeColor: "#0a0a0a",
     colorScheme: "dark",
     width: "device-width",
     initialScale: 1,
   };

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="ko" className="dark">
         <body className="bg-[#0a0a0a] text-white antialiased min-h-screen font-sans">
           {children}
         </body>
       </html>
     );
   }
   ```

   - `colorScheme`은 `"dark"` (단일 값, `"dark only"` 같은 비표준 금지).
   - `<html className="dark">` 고정 — 라이트모드 토글 미제공 (ADR-008).

2. **`app/page.tsx`** (Server Component, 임시 placeholder)
   - `<main className="mx-auto max-w-3xl px-4 md:px-6 lg:px-8 py-12">`
   - 한 줄 인사 + "준비 중" 텍스트.
   - 후속 task에서 ChatRoot로 교체된다는 주석 없이 placeholder만.

3. **`app/not-found.tsx`** (Server Component)
   - 404 친절 페이지 + `<Link href="/">홈으로</Link>` (next/link).
   - 헤더/푸터 없이 단순 레이아웃.

4. **`app/globals.css`** 확장:
   ```css
   @import "tailwindcss";

   @theme inline {
     --color-bg: #0a0a0a;
     --color-card: #141414;
     --color-border: #262626;     /* neutral-800 */
     --color-accent: oklch(0.93 0.18 130);  /* 또는 lime-300 hex */
     --font-sans: var(--font-pretendard, "Pretendard Variable"), system-ui, -apple-system,
                  "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
     --font-mono: "JetBrains Mono", ui-monospace, monospace;
   }

   @layer base {
     html, body { height: 100%; }
     body { line-height: 1.625; }   /* 한국어 leading-relaxed */
   }

   @keyframes typing-dot {
     0%, 100% { opacity: 0.3; }
     50%      { opacity: 1; }
   }
   ```
   — 정확한 OKLCH 값보다는 UI_GUIDE.md의 색 정의를 따른다. 위는 가이드.

5. **폰트 처리**
   - **Pretendard Variable woff2 파일이 없는 환경**에서는 시스템 폰트 fallback에만 의존. `next/font/local`로 로드 시도하되 파일 부재로 실패하면 `next/font/google`의 `Noto_Sans_KR` 등으로 대체.
   - 추천 안전 옵션: `next/font/local`로 `/public/fonts/PretendardVariable.woff2` 시도. 파일이 이미 존재하지 않으면 이 step에서는 시스템 폰트만 적용 + `--font-pretendard` 변수는 미선언. globals.css의 `--font-sans` fallback chain이 자동 작동.
   - **금지**: Google Fonts CDN 직접 `<link>`. 이유: `next/font` 정책.

### 핵심 규칙

- **Server Components only** (이 step). `"use client"` 사용 금지.
- 색상은 무채색 + lime-300 포인트 (UI_GUIDE.md).
- AI 슬롭 안티패턴 절대 금지: `backdrop-filter: blur`, gradient text, glow shadow, 보라/네온, 모든 카드 동일 rounded-2xl, blur-3xl orb.
- 한국어 lang attribute (`lang="ko"`) 고정.

## Acceptance Criteria

```bash
npm run lint          # 통과
npx tsc --noEmit      # 0 exit
npm run build         # next build 성공
```

수동 검증:
```bash
npm run dev &
sleep 5
curl -sS http://localhost:3000 | grep -q 'lang="ko"'
curl -sS http://localhost:3000 | grep -q 'class="dark"'
curl -sS http://localhost:3000 | grep -q 'theme-color'
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/non-existent | grep -q "404"
kill %1
```

## 검증 절차

1. AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - `<html lang="ko" className="dark">` 적용?
   - `theme-color: #0a0a0a` meta 삽입?
   - `colorScheme: "dark"` (단일 enum)?
   - `app/page.tsx`, `app/layout.tsx`, `app/not-found.tsx` 모두 server component (no `"use client"`)?
   - UI 슬롭 안티패턴 미사용?
   - 외부 폰트 CDN `<link>` 미사용?
3. `phases/0-scaffold/index.json` step 1을 `"completed"` + summary로 갱신.

## 금지사항

- **`"use client"` 지시문 추가 금지.** 이유: 이 step은 정적 셸. 인터랙션은 후속 task.
- **"Powered by AI" 같은 슬롭 텍스트 금지.** 이유: UI_GUIDE.md 안티패턴.
- **라이트 모드 토글, prefers-color-scheme media 분기 금지.** 이유: ADR-008 dark only.
- **Google Fonts `<link>` 직접 삽입 금지.** 이유: `next/font` 강제.
- **`backdrop-filter`, `gradient-text`, `box-shadow ... blur` 글로우 금지.** 이유: AI 슬롭.
- **이미지 첨부 (logo.svg, hero 이미지 등) 금지.** 이유: 셸 단계, 자산은 후속.
- **컴포넌트 추출 금지** (`<Header/>`, `<Footer/>` 분리). 이유: 후속 task에서 layout 컴포넌트 정식 도입.
