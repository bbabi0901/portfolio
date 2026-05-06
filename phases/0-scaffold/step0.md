# Step 0: project-init

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` — CRITICAL 규칙 + 기술 스택 + 디자인 규칙
- `/docs/ADR.md` — 24개 기술 결정 (Next 16, Tailwind only no Sass, dark only 등)
- `/docs/ARCHITECTURE.md` — 디렉토리 구조 + 런타임 분리

이전 step 산출물 없음 (이 task의 첫 step).

## 작업

Next.js 16 + TypeScript strict + Tailwind CSS 4 프로젝트의 빌드/dev 환경을 만든다. 페이지 코드와 컴포넌트는 다음 step에서. 이 step은 root config 파일만 다룬다.

### 생성할 파일

1. `package.json`
   - `name`: `ai-portfolio`, `private`: true, `version`: `0.1.0`.
   - `engines`: `{ "node": ">=22.12.0" }`.
   - `dependencies`: `next@^16.2`, `react@^19`, `react-dom@^19`.
   - `devDependencies`: `typescript@^5.9`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss@^4.2`, `@tailwindcss/postcss@^4.2`, `postcss@^8`, `eslint@^9`, `eslint-config-next@^16.2`, `typescript-eslint@^8`, `prettier@^3`, `prettier-plugin-tailwindcss@^0.6`.
   - `scripts`:
     - `"dev": "next dev"`
     - `"build": "next build"`
     - `"start": "next start"`
     - `"lint": "eslint ."`
     - `"format": "prettier --write ."`
     - `"format:check": "prettier --check ."`

2. `tsconfig.json`
   - `target: "ES2022"`, `module: "esnext"`, `moduleResolution: "bundler"`, `jsx: "preserve"`.
   - `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
   - `paths: { "@/*": ["./*"] }`.
   - `plugins: [{ "name": "next" }]`.
   - `include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"]`, `exclude: ["node_modules", ".next"]`.

3. `next.config.ts`
   - `import type { NextConfig } from "next";`
   - `reactStrictMode: true`, `typedRoutes: true`.
   - `output` 미지정 (SSR/SSG 혼합 사용).

4. `postcss.config.mjs`
   - `export default { plugins: { "@tailwindcss/postcss": {} } };`

5. `eslint.config.mjs` (ESLint v9 flat config)
   - `import nextConfig from "eslint-config-next";`
   - `import tseslint from "typescript-eslint";`
   - `import prettier from "eslint-config-prettier";`
   - 단일 array export. `next/core-web-vitals` + `next/typescript` 포함.
   - `plugins: { "@typescript-eslint": tseslint.plugin }` 명시 (커스텀 룰 시).
   - `ignores: [".next", "node_modules", "out", "playwright-report", "coverage"]`.

   **주의**: ESLint v9 + FlatCompat 조합은 circular structure 에러를 자주 일으킨다. `eslint-config-next`를 직접 import하라.

6. `.prettierrc.json`
   - `{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100, "tabWidth": 2, "plugins": ["prettier-plugin-tailwindcss"] }`.

7. `.prettierignore`
   - `node_modules`, `.next`, `out`, `coverage`, `playwright-report`, `data/portfolio.server.json`, `public/data`.

8. `.nvmrc`
   - `22.12.0` (단일 라인).

9. `app/globals.css`
   - 첫 줄: `@import "tailwindcss";`
   - `@theme inline { ... }` 블록은 다음 step(app-shell)에서 채운다. 이 step은 `@import`만.

### 인스톨

`npm install` 실행하여 `node_modules/`와 `package-lock.json` 생성.

### 핵심 규칙 (위반 금지)

- **Sass/SCSS 절대 사용 금지** (CLAUDE.md, ADR-007).
- **TypeScript strict + noUncheckedIndexedAccess** (CLAUDE.md).
- `any` 사용 지양. 명시적 타입.
- Next 16 deprecated 옵션 금지 (`experimental.appDir` 등).

## Acceptance Criteria

```bash
node --version                           # v22.12.x 출력
npm install                              # 0 exit, lock 파일 생성
npx next --version                       # 16.x 출력
npx tsc --noEmit                         # 0 exit (소스 없으므로 정상)
test -f package-lock.json
test -f .nvmrc
test -f tsconfig.json
test -f next.config.ts
test -f postcss.config.mjs
test -f eslint.config.mjs
test -f .prettierrc.json
test -f app/globals.css
```

## 검증 절차

1. 위 AC 커맨드 실행.
2. 아키텍처 체크리스트:
   - ARCHITECTURE.md 디렉토리 구조 따름? (root config 파일 + `app/` 시작)
   - ADR-001 (Next 16), ADR-007 (Tailwind only), ADR-008 (dark only) 위반 없음?
   - CLAUDE.md "Tailwind CSS only (Sass 미사용)" 준수?
   - `package.json` 의존성에 `sass`, `node-sass`, `styled-components`, `emotion` 등 없음?
3. 결과:
   - 성공 → `phases/0-scaffold/index.json` step 0을 `"status": "completed"`, `"summary": "Next 16 + TS strict + Tailwind 4 scaffold (package.json, tsconfig, next.config, postcss, eslint v9 flat, prettier, .nvmrc, app/globals.css 빈 베이스) 생성, npm install 완료"`로 갱신.
   - 3회 시도 후 실패 → `"status": "error"`, `"error_message": "<구체적>"`.
   - 외부 인증/네트워크 차단 등 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "<사유>"`.

## 금지사항

- **Sass/SCSS 추가 금지.** 이유: ADR-007에서 Tailwind only 결정.
- **`app/page.tsx`, `app/layout.tsx`, 컴포넌트 파일 작성 금지.** 이유: 다음 step(app-shell)에서 다룬다.
- **`next lint` 스크립트 사용 금지.** 이유: Next 16에서 deprecated. `eslint .` 사용.
- **`experimental.appDir` 같은 deprecated 옵션 금지.** 이유: Next 16에서 default + 제거됨.
- **`yarn`, `pnpm` 사용 금지.** 이유: lock 파일 단일성 (CLAUDE.md).
- **API 키 환경변수 직접 추가 금지.** 이유: `.env.local.example`에 이미 명세됨, 코드는 이 step 범위 밖.
- **버전 latest 핀 금지** (`"next": "latest"` 같은). 이유: 재현 가능 빌드.
