# 프로젝트: AI Portfolio (김윤수 대화형 포트폴리오)

> 채용 담당자/동료 개발자가 자연어로 김윤수의 커리어·프로젝트·기술을 물어보면, 노션 기록 기반으로 답하는 사이트.
> 본 문서는 코드베이스 작업의 최우선 규칙. 충돌 시 본 문서가 docs/ 보다 우선한다.

## 기술 스택
- Next.js 16 (App Router) + TypeScript strict
- Tailwind CSS only (Sass 미사용)
- shadcn/ui (sheet, button, input, select, carousel, popover, scroll-area, toast, form, label, textarea, radio-group)
- lucide-react 아이콘 (strokeWidth 1.5)
- Hono on Next.js Route Handler (`app/api/[[...route]]/route.ts`)
- Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`)
- `@ai-sdk/react`의 `useChat`
- @notionhq/client + notion-to-md
- react-markdown + remark-gfm + rehype-highlight
- react-hook-form + zod resolver (Contact 폼)
- Vitest + Testing Library + msw + Playwright

## 아키텍처 규칙
- CRITICAL: 모든 LLM 호출과 Notion API 호출은 Hono 라우트(`app/api/[[...route]]/route.ts`)에서만. 클라이언트는 같은 origin의 `/api/*`만 호출.
- CRITICAL: API 키(OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, NOTION_TOKEN, RESEND_API_KEY)는 환경변수, 클라이언트 번들에 절대 포함 금지.
- CRITICAL: 답변은 `data/portfolio.server.json`(빌드 산출물) 컨텍스트로만 생성. 외부 지식은 system prompt에서 차단.
- CRITICAL: `data/portfolio.server.json`(임베딩 포함)은 서버 전용. 클라이언트에는 `public/data/suggestions.json`(slim) 만 노출.
- CRITICAL: spec.json 위반 시 빌드 차단. 신규 기능은 (1) spec.json 등록 → (2) 실패 테스트 작성 → (3) 구현 순서.
- 컴포넌트는 `components/`, 타입은 `types/`, 도메인 로직은 `lib/`, 외부 API 래퍼는 `services/`, 빌드 스크립트는 `scripts/`.
- Server Components 기본. 인터랙션이 필요한 곳만 `"use client"`.
- `/api/chat`은 Edge runtime, `/api/feedback`·`/api/contact`은 Node runtime (Notion SDK 안정성).
- 시간 표기는 항상 한국 시간 (Asia/Seoul, KST).

## 디자인 규칙
- 다크 모드 only. `<html class="dark">` 고정. `theme-color: #0a0a0a`.
- AI 슬롭 안티패턴 금지: backdrop-filter blur, gradient-text, "Powered by AI" 배지, glow 애니메이션, 보라/네온 브랜드 색, 모든 카드 동일 rounded-2xl, blur-3xl orb. 자세한 정책은 docs/UI_GUIDE.md.
- 애니메이션 화이트리스트만 사용. 그 외 모두 금지.
- 한국어 폰트: Pretendard Variable (next/font/local), fallback 시스템.
- 색상은 무채색(neutral) + 포인트 1색 (lime-300, 절제). 자세한 토큰은 docs/UI_GUIDE.md.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 (1) spec.json `features[]`에 FEAT-XXX 등록 → (2) 실패 테스트 작성 → (3) 통과 구현. (TDD + SDD)
- CRITICAL: 사용자에게 보이는 변경은 docs/TEST_SCENARIOS.md의 TS-XX와 매핑되어야 함.
- 커밋 메시지는 conventional commits (feat:, fix:, docs:, refactor:, test:, chore:).
- PR은 `npm run check:spec`, `npm run lint`, `npm run test`가 통과해야 머지.
- 노션 콘텐츠 변경 → 다음 빌드시 자동 반영. 수동 동기화는 `npm run sync:notion`.
- 문서 변경(plan/PRD/Architecture/spec.json)이 코드 변경과 함께 가야 함.

## 명령어
```
npm run dev                # 개발 서버 (localhost:3000)
npm run build              # prebuild(sync:notion + gen:suggestions) → next build
npm run lint
npm run test               # vitest 단발
npm run test:watch
npm run e2e                # Playwright
npm run sync:notion        # 노션 → data/portfolio.server.json + public/data/suggestions.json
npm run gen:suggestions    # portfolio.server.json → 추천 질문 후보 + 관련 질문 매핑
npm run check:spec         # spec.json 유효성 + 모든 FEAT의 tests 파일 존재 검증
```

## 파일 절대 규칙
- `.env.local`은 git에 커밋 금지 (`.gitignore` 포함).
- `data/portfolio.server.json`은 git 미커밋(빌드 산출물). 단 mini sample은 `data/portfolio.sample.json`로 커밋.
- `public/data/suggestions.json`은 git 미커밋(빌드 산출물).
- `spec.json`, `spec.schema.json`은 커밋.
- 노션 토큰은 logs에 절대 출력 금지.

## 현재 워크 컨텍스트
- 소유자: 김윤수 (YoonsooKim9, bbabi0901@gmail.com)
- 컨텐츠 소스: Notion 워크스페이스 (`기록v2` 하위)
- 배포 대상: Vercel
- 시간 기준: KST
