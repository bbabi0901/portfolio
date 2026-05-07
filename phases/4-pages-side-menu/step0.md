# Step 0: layout-shell

## 읽어야 할 파일

- `/CLAUDE.md` — 다크 only, AI 슬롭 안티패턴 금지.
- `/docs/UI_GUIDE.md` § 8 레이아웃 + 색 토큰 + 애니메이션 화이트리스트, § 8.12 푸터.
- `/docs/RESPONSIVE.md` — 사이드 메뉴 폭 (모바일 100vw, 태블릿/데스크톱 320px), Header 56/64px.
- `/docs/PAGES.md` — 4 페이지 (대화/자기소개/기술이력/연락하기) + 공통 layout.
- `/spec.json` — `features[]` 의 FEAT-023 (Hamburger Side Menu), FEAT-018 (폰트/safe area), FEAT-020 (푸터), FEAT-029 (라우팅 / 페이지 전환 UX).
- `/components/ui/sheet.tsx`, `button.tsx` — shadcn.
- `/app/layout.tsx` — 이전 task (현재 RootLayout placeholder).
- `/app/page.tsx` — 채팅 ChatRoot mount (이전 task `3-chat-ui` 산출물).

## 작업

전 페이지 공통 layout shell. Header (햄버거 + brand), SideSheet (slide-in 메뉴 + focus trap + scroll lock + ESC + overlay + route-change auto-close), SideMenuItem, Footer. `app/layout.tsx` 갱신.

### TDD 순서

1. `specs/components/layout-shell.spec.tsx` 작성 (실패).
2. 컴포넌트 구현 (통과).

### 생성할 파일

#### 1. `components/layout/Header.tsx`

```tsx
"use client";
import { Menu } from "lucide-react";
import Link from "next/link";

export interface HeaderProps {
  onMenuOpen: () => void;
  menuOpen: boolean;             // aria-expanded 동기화
  className?: string;
}
export function Header(props: HeaderProps): JSX.Element;
```

- 좌: `<Link href="/">` brand text "김윤수 — AI Portfolio" (text-sm text-neutral-300, hover white).
- 우: 햄버거 button (`<Menu />` size 18, strokeWidth 1.5). aria-label "메뉴 열기" or "메뉴 닫기" toggle.
- 높이: 모바일 56px, 데스크톱 64px (`h-14 md:h-16`).
- max-w 채팅 페이지 max-w-3xl 내부에서 사용. layout 에서 mx-auto 처리.
- 단순 sticky top-0 + bg-[#0a0a0a]/95 (backdrop-blur 없이 — AI 슬롭 금지).

#### 2. `components/layout/SideSheet.tsx` (Sheet wrapper)

```tsx
"use client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SideMenuItem } from "./SideMenuItem";

export interface SideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;          // active 메뉴 표시
  socials?: { github?: string; linkedin?: string; email?: string };
  lastUpdated?: string;         // 푸터 동일 정보 — 사이드 메뉴 하단에도 작게
  className?: string;
}
export function SideSheet(props: SideSheetProps): JSX.Element;
```

#### 동작 명세

- shadcn `Sheet` (Radix dialog 기반). `side="right"`.
- 모바일 (`<md`): `w-screen`. 태블릿/데스크톱: `w-80` (320px). `max-w-full`.
- **focus trap**: Radix dialog 가 기본 제공. 첫 메뉴 항목 자동 focus 는 `<SheetContent onOpenAutoFocus>` callback 으로 우리가 명시 처리.
- **scroll lock**: Radix 가 body overflow:hidden 자동 처리.
- **ESC 닫기**: 기본 동작.
- **overlay 클릭 닫기**: 기본 동작.
- **route 변경 시 auto-close**: `usePathname()` 변경 감지 → `onOpenChange(false)`.
- **debounce 토글 80ms**: 빠른 햄버거 연타 방지. 부모 컴포넌트(layout client wrapper) 에서 처리하거나 SideSheet 내부 setState debounce.
- **prefers-reduced-motion**: `motion-reduce:transition-none` 클래스로 즉시 표시.

#### 메뉴 항목 (4개)

```ts
const MENU = [
  { href: "/",            label: "대화",       icon: "MessageCircle" },
  { href: "/about",       label: "자기소개",   icon: "User" },
  { href: "/experience",  label: "기술 이력",  icon: "Briefcase" },
  { href: "/contact",     label: "연락하기",   icon: "Mail" },
];
```

#### 하단 social + 마지막 업데이트

- GitHub / Email / LinkedIn (있으면) 작은 아이콘 row.
- 그 아래 `마지막 업데이트: {lastUpdated}` (text-xs text-neutral-500).

#### 3. `components/layout/SideMenuItem.tsx`

```tsx
"use client";
import Link from "next/link";
import { LucideIcon } from "lucide-react";

export interface SideMenuItemProps {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;          // 현재 path 와 매칭 시 강조 점
  onClick?: () => void;     // sheet 안에서 클릭 시 close 호출
  className?: string;
}
export function SideMenuItem(props: SideMenuItemProps): JSX.Element;
```

- `<Link>` + 아이콘 + label.
- active=true → 좌측에 작은 lime-300 dot (FEAT-023 active 표시).
- 키보드 화살표 위/아래는 SideSheet 컨테이너에서 처리 (radio-group 방식 또는 직접 keyDown handler).

#### 4. `components/layout/Footer.tsx`

```tsx
"use client";
export interface FooterProps {
  lastUpdated?: string;       // KST YYYY-MM-DD
  socials?: { github?: string; linkedin?: string; email?: string };
  className?: string;
}
export function Footer(props: FooterProps): JSX.Element;
```

- 단일 row (FEAT-020). text-xs text-neutral-500.
- 모바일 stack 3-row, 태블릿+ 1-row.
- 좌: 마지막 업데이트 (없으면 "—"). 중앙: social icon row (lucide Github/Mail/Linkedin). 우: 짧은 프라이버시 문구 + `(i)` hover popover (shadcn Popover 또는 단순 title attr).
- sticky 아님. 자연 스크롤 후 등장.
- 각 페이지 main 끝에 mount.

#### 5. `app/layout.tsx` (server component) 갱신

```tsx
import { loadSpec } from "@/lib/spec-loader";
import { LayoutClient } from "@/components/layout/LayoutClient";
// metadata + viewport export 는 그대로

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // server 측에서 portfolio.server.json 의 generatedAt 을 읽으려 시도.
  // 실패 시 lastUpdated="—".
  let lastUpdated: string | undefined;
  try {
    const data = await import("@/data/portfolio.server.json", { assert: { type: "json" } });
    lastUpdated = formatKstDate(data.default.generatedAt);
  } catch {
    lastUpdated = undefined;
  }

  const socials = {
    github: "https://github.com/YoonsooKim9",
    email: "mailto:bbabi0901@gmail.com",
    // linkedin: "...",   // spec.json 또는 환경변수에 정의되면 추가
  };

  return (
    <html lang="ko" className="dark">
      <body className="bg-[#0a0a0a] text-white antialiased min-h-screen font-sans">
        <LayoutClient socials={socials} lastUpdated={lastUpdated}>{children}</LayoutClient>
      </body>
    </html>
  );
}
```

#### 6. `components/layout/LayoutClient.tsx` (client orchestrator)

```tsx
"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { SideSheet } from "./SideSheet";
import { Footer } from "./Footer";

export interface LayoutClientProps {
  children: React.ReactNode;
  lastUpdated?: string;
  socials?: { github?: string; email?: string; linkedin?: string };
}
export function LayoutClient({ children, lastUpdated, socials }: LayoutClientProps): JSX.Element;
```

- `useState<boolean>` open.
- 햄버거 클릭 → setOpen(true). debounce 80ms.
- `usePathname()` 변경 감지 → `setOpen(false)`.
- Header (sticky top), main (children), Footer.
- SideSheet 는 root 레벨에 portal 로 자동.

### Specs (TDD red)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("Header", () => {
  it("brand link → '/'", () => { /* … */ });
  it("햄버거 클릭 → onMenuOpen 호출", async () => { /* … */ });
  it("aria-expanded 가 menuOpen prop 따라감", () => { /* … */ });
  it("aria-label '메뉴 열기' / '메뉴 닫기' 토글", () => { /* … */ });
});

describe("SideSheet", () => {
  it("open=false → SheetContent 미렌더 (또는 hidden)", () => { /* … */ });
  it("open=true → 4개 메뉴 항목 모두 렌더", () => { /* … */ });
  it("ESC 키 → onOpenChange(false)", async () => { /* … */ });
  it("메뉴 항목 클릭 → onOpenChange(false)", async () => { /* … */ });
  it("active path 항목에 강조 점 표시", () => { /* … */ });
  it("currentPath 변경 시 자동 close (useEffect)", () => { /* … */ });
});

describe("Footer", () => {
  it("lastUpdated 미지정 시 '—' 표시", () => { /* … */ });
  it("socials.github 있으면 GitHub link 노출", () => { /* … */ });
  it("프라이버시 popover (i) hover/click 시 자세한 문구", async () => { /* … */ });
});

describe("LayoutClient", () => {
  it("햄버거 클릭 → SideSheet open=true", async () => { /* … */ });
  it("usePathname 변경 시 SideSheet 자동 close", async () => { /* router push mock */ });
  it("80ms 미만 연타 → 마지막 토글만 적용 (debounce)", async () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **AI 슬롭 금지**: Header backdrop-filter blur 사용 금지. 단순 bg+opacity.
- **shadcn Sheet 내부 코드 수정 금지.** 토큰만으로 커스터마이징.
- **focus trap 직접 구현 금지** (Radix 가 제공).
- **route-change auto-close 는 usePathname 변경으로만**. router.events 사용 X (Next 13+ deprecated).
- **lastUpdated 포맷은 KST YYYY-MM-DD.** Asia/Seoul 명시.
- **사이드 메뉴 첫 항목 자동 focus 는 onOpenAutoFocus 사용.** 직접 ref.focus() 호출 X (Radix 와 race).

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `components/layout/{Header,SideSheet,SideMenuItem,Footer,LayoutClient}.tsx`, spec 파일 존재.
   - `app/layout.tsx` 갱신 (LayoutClient 합성).
   - 모든 spec 통과.
   - `grep -nE "backdrop-filter|blur-3xl" components/layout/` → 0건.
3. `phases/4-pages-side-menu/index.json` step 0 갱신.

## 금지사항

- **`/about`, `/experience`, `/contact` 페이지 추가 금지.** 이유: 후속 step.
- **chat 페이지 (`app/page.tsx`) 변경 금지.** 이유: 이미 ChatRoot mount 완료.
- **router.events 또는 Next.js Pages Router API 사용 금지.** App Router 만.
- **`useRouter().asPath` 사용 금지.** `usePathname()` 사용.
- **dialog 의 inert attribute 직접 설정 금지.** Radix 가 처리.
- **Footer 에 인라인 SVG 아이콘 금지.** lucide-react 만.
