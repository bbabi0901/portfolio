# Step 2: shadcn-ui

## 읽어야 할 파일

- `/CLAUDE.md` — shadcn 컴포넌트 목록 (sheet, button, input, select, carousel, popover, scroll-area, toast, form, label, textarea, radio-group)
- `/docs/UI_GUIDE.md` — 컴포넌트별 클래스 명세
- `/docs/PAGES.md` — 페이지별 사용 컴포넌트 매핑
- `/docs/ARCHITECTURE.md` — `components/` 디렉토리 구조

이전 step에서 만들어진 파일:

- `/package.json` — 의존성 (react 19, next 16, tailwind 4)
- `/app/globals.css` — `@theme` 토큰
- `/app/layout.tsx` — body 클래스, font 변수
- `/tsconfig.json` — paths `@/*`

이전 step의 globals.css와 layout.tsx를 읽고, shadcn이 생성하는 컴포넌트가 토큰과 충돌하지 않게 한다.

## 작업

shadcn/ui 초기화 + MVP에 필요한 컴포넌트 generate. 생성된 컴포넌트 내부 코드는 **수정 금지**.

### 작업 순서

1. **`components.json`** 작성 (shadcn 설정):
   ```json
   {
     "$schema": "https://ui.shadcn.com/schema.json",
     "style": "new-york",
     "rsc": true,
     "tsx": true,
     "tailwind": {
       "config": "",
       "css": "app/globals.css",
       "baseColor": "neutral",
       "cssVariables": true,
       "prefix": ""
     },
     "aliases": {
       "components": "@/components",
       "utils": "@/lib/utils",
       "ui": "@/components/ui",
       "lib": "@/lib",
       "hooks": "@/hooks"
     }
   }
   ```

2. **`lib/utils.ts`** (`cn()` helper):
   ```ts
   import { clsx, type ClassValue } from "clsx";
   import { twMerge } from "tailwind-merge";

   export function cn(...inputs: ClassValue[]) {
     return twMerge(clsx(inputs));
   }
   ```
   - `clsx`, `tailwind-merge` devDependency 추가.

3. **`lucide-react`** 의존성 추가 (이전 step에 누락됐을 수 있음).
   - dependencies (devDependencies 아님): `lucide-react@^0.460`.

4. **shadcn 컴포넌트 generate** — 다음 명령을 순차 실행:
   ```bash
   npx shadcn@latest add button --yes
   npx shadcn@latest add input --yes
   npx shadcn@latest add textarea --yes
   npx shadcn@latest add select --yes
   npx shadcn@latest add label --yes
   npx shadcn@latest add sheet --yes
   npx shadcn@latest add popover --yes
   npx shadcn@latest add scroll-area --yes
   npx shadcn@latest add carousel --yes
   npx shadcn@latest add form --yes
   npx shadcn@latest add radio-group --yes
   npx shadcn@latest add card --yes
   npx shadcn@latest add sonner --yes
   ```

   - `toast` 대신 `sonner` 사용 (shadcn 최신은 sonner 권장).
   - 각 명령은 `components/ui/<name>.tsx` 생성 + 필요한 Radix 의존성 자동 추가.
   - `--yes`로 prompt skip.
   - shadcn CLI 실행 시 인터넷 필요. 차단 환경이면 사용자에게 blocked.

5. **자동 추가될 dependencies 확인**:
   - `@radix-ui/react-*` (slot, dialog, popover, scroll-area, label, radio-group, select 등)
   - `embla-carousel-react`
   - `class-variance-authority`
   - `react-hook-form`
   - `@hookform/resolvers`
   - `zod` — 다음 step에서도 필요하므로 여기서 들어오면 OK.
   - `sonner`

6. **`components/ui/*.tsx`** 생성 결과 검증 — 12개 이상 파일 존재.

### 핵심 규칙

- 생성된 shadcn 컴포넌트는 **수정 금지**. 색/폰트는 globals.css 토큰으로 자동 반영.
- `cn()` helper는 `lib/utils.ts` 단일 위치.
- shadcn이 직접 사용하는 client directive는 그대로 둔다.
- 추가로 필요한 Radix 패키지가 있으면 shadcn이 자동 설치하게 두고, 수동 npm install 금지.

## Acceptance Criteria

```bash
test -f components.json
test -f lib/utils.ts
test -f components/ui/button.tsx
test -f components/ui/input.tsx
test -f components/ui/textarea.tsx
test -f components/ui/select.tsx
test -f components/ui/label.tsx
test -f components/ui/sheet.tsx
test -f components/ui/popover.tsx
test -f components/ui/scroll-area.tsx
test -f components/ui/carousel.tsx
test -f components/ui/form.tsx
test -f components/ui/radio-group.tsx
test -f components/ui/card.tsx
test -f components/ui/sonner.tsx
npm run lint                  # 통과 (생성된 컴포넌트 포함)
npx tsc --noEmit              # 0 exit
npm run build                 # 성공
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - `components.json`의 css path가 `app/globals.css`?
   - `aliases.utils`가 `@/lib/utils`?
   - 생성된 컴포넌트의 import가 `@/lib/utils`로 정상 해석?
   - lucide-react import가 정상?
   - 생성 컴포넌트 내부에 `"use client"`가 적절히 사용됨 (shadcn 기본)?
3. `phases/0-scaffold/index.json` step 2 갱신.

## 금지사항

- **`components/ui/*.tsx` 내부 수정 금지.** 이유: shadcn 업데이트 시 충돌. 토큰으로 충분히 커스터마이징 가능.
- **MVP 외 컴포넌트(dialog, alert, calendar, command, accordion, table 등) 추가 금지.** 이유: 번들 사이즈 + YAGNI.
- **emotion, styled-components, stitches 추가 금지.** 이유: ADR-007 Tailwind only.
- **toast 컴포넌트 사용 금지** (deprecated). 이유: shadcn 최신은 sonner 권장.
- **shadcn legacy "default" style 사용 금지.** 이유: components.json의 `style: "new-york"` 강제.
- **`tailwind.config.ts` 생성 금지.** 이유: Tailwind 4는 inline `@theme` 사용. config 파일은 deprecated.
- **글로벌 CSS reset 라이브러리(reset.css, normalize.css) 추가 금지.** 이유: Tailwind preflight로 충분.
