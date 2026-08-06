# 프로젝트: AI Portfolio (김윤수 대화형 포트폴리오)

> 채용 담당자/동료 개발자가 자연어로 김윤수의 커리어·프로젝트·기술을 물어보면, 노션 기록 기반으로 답하는 사이트.
> 본 문서는 코드베이스 작업의 최우선 규칙. 충돌 시 본 문서가 docs/ 보다 우선한다.
> Agent entry point: [AGENTS.md](AGENTS.md) — table of contents · role 매핑. 깊은 spec 은 `docs/agents/` 에.

## 기술 스택
- Next.js 16 (App Router) + TypeScript strict
- Tailwind CSS only (Sass 미사용)
- shadcn/ui (sheet, button, input, select, carousel, popover, scroll-area, toast, form, label, textarea, radio-group)
- lucide-react 아이콘 (strokeWidth 1.5)
- Hono on Next.js Route Handler (`app/api/[[...route]]/route.ts`)
- Vercel AI SDK (`ai`, `@ai-sdk/amazon-bedrock` ^4 고정 — 5.x 는 ai@6 비호환) + **AWS Bedrock** (ADR-034/035, **전환 완료** — 구 OpenRouter/Voyage/OpenAI 키 제거됨 FEAT-039)
  - 채팅: Nova Lite(기본)/Nova Micro = `apac.` inference profile, Claude Haiku 4.5 = `global.` profile
  - 임베딩: Titan Text Embeddings v2 1024차원 (sync + 런타임 쿼리)
  - 벡터 검색: S3 Vectors(서울) 런타임 하이브리드 (FEAT-037, 800ms 타임아웃 시 keyword-only 강등 ERR-14)
  - 인제스천: Lambda `portfolio-ingest-sync` + EventBridge 24h (ADR-037, FEAT-038) — 노션 수정이 재배포 없이 자동 반영, 런타임은 S3 corpus.json 10분 TTL(장애 시 커밋 데이터 폴백)
  - 인증: 로컬 = `PORTFOLIO_AWS_PROFILE`(aws login), Vercel = OIDC→IAM role (`PORTFOLIO_AWS_ROLE_ARN`, 토큰은 요청 컨텍스트 — env 검사 금지). Vercel 함수 리전 icn1 고정 (vercel.json). IaC 는 `infra/` CDK TypeScript 워크스페이스
- `@ai-sdk/react`의 `useChat`
- @notionhq/client + notion-to-md
- react-markdown + remark-gfm + rehype-highlight
- react-hook-form + zod resolver (Contact 폼)
- Vitest + Testing Library + msw + Playwright

## 아키텍처 규칙
- CRITICAL: 모든 LLM 호출과 Notion API 호출은 Hono 라우트(`app/api/[[...route]]/route.ts`)에서만. 클라이언트는 같은 origin의 `/api/*`만 호출.
- CRITICAL: 비밀 값(NOTION_TOKEN, RESEND_API_KEY, AWS 자격 증명)은 환경변수/SSM, 클라이언트 번들에 절대 포함 금지.
- CRITICAL: 답변은 `data/portfolio.server.json`(빌드 산출물) 컨텍스트로만 생성. 외부 지식은 system prompt에서 차단.
- CRITICAL: `data/portfolio.server.json`(임베딩 포함)은 서버 전용. 클라이언트에는 `public/data/suggestions.json`(slim) 만 노출.
- CRITICAL: spec.json 위반 시 빌드 차단. 신규 기능은 (1) spec.json 등록 → (2) 실패 테스트 작성 → (3) 구현 순서.
- 컴포넌트는 `components/`, 타입은 `types/`, 도메인 로직은 `lib/`, 외부 API 래퍼는 `services/`, 빌드 스크립트는 `scripts/`.
- Server Components 기본. 인터랙션이 필요한 곳만 `"use client"`.
- 모든 API 라우트는 Node runtime (ADR-031 — 커밋된 RAG 데이터가 Edge 1MB 번들 한도 초과. `/api/feedback`·`/api/contact`은 Notion SDK 안정성).
- 시간 표기는 항상 한국 시간 (Asia/Seoul, KST).

## 디자인 규칙
- 라이트/다크 테마 지원. 기본 시스템(`prefers-color-scheme`) 자동, 사이드바(SideSheet) 토글로 시스템/라이트/다크 선택. `next-themes`가 `<html>`에 `.light`/`.dark` 클래스 토글. `theme-color`는 라이트 `#ffffff`/다크 `#0a0a0a` media 쌍.
- CRITICAL: 색상은 하드코딩 Tailwind 색(`bg-neutral-900`, `text-white` 등) 금지, 반드시 `app/globals.css`의 시맨틱 토큰 유틸 사용. 표면: `bg-background`/`bg-surface`/`bg-elevated`, 텍스트: `text-foreground`/`text-body`/`text-muted`/`text-subtle`/`text-faint`, 경계: `border-line`/`border-line-strong`/`border-line-subtle`, 포인트: `text-brand`/`bg-brand`, 상태: `text-danger`/`text-warning`/`text-success`. 반전(라임/전경 위 텍스트)은 `bg-foreground text-background`. 마크다운 prose는 `prose dark:prose-invert`.
- AI 슬롭 안티패턴 금지: backdrop-filter blur, gradient-text, "Powered by AI" 배지, glow 애니메이션, 보라/네온 브랜드 색, 모든 카드 동일 rounded-2xl, blur-3xl orb. 자세한 정책은 docs/UI_GUIDE.md.
- 애니메이션 화이트리스트만 사용. 그 외 모두 금지.
- 한국어 폰트: Pretendard Variable (next/font/local), fallback 시스템.
- 색상은 무채색(neutral) + 포인트 1색 (brand = lime, 라이트 lime-600 / 다크 lime-300, 절제). 자세한 토큰은 docs/UI_GUIDE.md.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 (1) spec.json `features[]`에 FEAT-XXX 등록 → (2) 실패 테스트 작성 → (3) 통과 구현. (TDD + SDD)
- CRITICAL (사용자 명시): 핵심 기능(채팅·RAG·스트리밍 등)은 반드시 3개 레벨 테스트가 모두 존재해야 한다. Unit(`specs/`, Vitest) + Integration(`specs/`, API 엔드포인트 레벨) + E2E(`tests/e2e/`, Playwright, MOCK_LLM=1). 신규 핵심 기능은 테스트 시나리오 설계 → 실패 테스트 작성 → 구현 순서 엄수.
- CRITICAL: 사용자에게 보이는 변경은 docs/TEST_SCENARIOS.md의 TS-XX와 매핑되어야 함.
- **CRITICAL (사용자 명시): 사용자/기획자가 새 기능·디자인·UX·규칙·이슈 fix 를 요청할 때마다 그 변경을 적절한 SSoT 파일에 즉시 기록한다.** PR 머지 전 self-check 의무. 기록 매핑:
  - **기능 / 동작**: `spec.json` features[] (FEAT-XXX) + testScenarios[] (TS-NN, file 경로 매핑) + version bump
  - **아키텍처 / 기술 결정**: `docs/ADR.md` (ADR-XXX) + 본 `CLAUDE.md` 의 기술 스택 절
  - **UI/UX 디테일** (색·간격·말풍선·아바타 등): `docs/UI_GUIDE.md` 토큰 절 + `docs/PAGES.md` 와이어프레임
  - **반응형**: `docs/RESPONSIVE.md` 표
  - **노션 schema**: `docs/NOTION_SCHEMA.md`
  - **SEO/OG**: `docs/SEO_POLICY.md`
  - **에러 / 봇 보호 / edge case**: `spec.json` errorPolicies[] / edgeCasePolicies[]
  - **작업 분할**: `phases/stories.json` 큐 (ADR-036 — `/loop` 1회 = 스토리 1개, `passes` 갱신은 reviewer 전용)
  - **Agent 정의 / 워크플로우 변경**: `AGENTS.md` 의 Agents 디렉토리 표 + `docs/agents/*.md` (각 agent 의 spec)
  - dev 서버에서 즉답으로 변경하면서 spec/docs 누락한 채 commit/push 금지. 시간 절약 명목으로도.
- **CRITICAL (사용자 명시): LLM API 연동 변경 시 수동 검증 필수.** 모든 테스트는 `MOCK_LLM=1`에서 실행되므로 실제 API 문제를 감지 못한다. 아래 상황에서 반드시 `MOCK_LLM` 미설정 상태로 로컬에서 multi-turn 직접 확인 후 merge:
  - `@ai-sdk/*` 버전 업그레이드
  - `lib/models.ts` LLM 호출 방식 변경
  - 스트리밍 파이프라인(`app/api/[[...route]]/route.ts`) 변경
  - 수동 검증 방법: `PORTFOLIO_AWS_PROFILE=default npm run test:smoke` (aws login 세션 필요) 또는 dev 서버에서 직접 2-turn 대화 확인
- 커밋 메시지는 conventional commits (feat:, fix:, docs:, refactor:, test:, chore:).
- PR은 `npm run check:spec`, `npm run lint`, `npm run test`가 통과해야 머지.
- **노션 콘텐츠 반영은 기본 자동 (ADR-037)**: Lambda `portfolio-ingest-sync` 가 24h 주기로 stale 감지 시 S3 corpus/벡터를 갱신하고 런타임이 10분 TTL 로 읽는다. 즉시 반영: `aws lambda invoke --function-name portfolio-ingest-sync --region ap-northeast-2 out.json`. 아래 로컬 플로우는 커밋 폴백 데이터 갱신·로컬 dev 용으로 유지.
- **노션 콘텐츠 반영 플로우 (ADR-030, 조건부 sync — 커밋 폴백 데이터)**: 빌드는 기본적으로 sync 를 생략하고 커밋된 `data/portfolio.server.json` 을 사용한다. 노션 변경 반영 절차 = `npm run sync:check`(신선도 판단, STALE 시 exit 1) → `npm run sync:notion` → `data/portfolio.server.json` + `data/embeddings-cache.json` 커밋 → 푸시(=배포). prebuild 게이트 우선순위: `SKIP_NOTION_SYNC=1`(생략) > `FORCE_NOTION_SYNC=1`(강제) > 데이터 부재(안전망 sync) > 생략.
- 문서 변경(plan/PRD/Architecture/spec.json)이 코드 변경과 함께 가야 함.

## Git Workflow 규칙 (사용자 명시)
- CRITICAL: 모든 작업은 worktree에서 진행. main 브랜치는 PR 머지로만 갱신.
- CRITICAL: 새 task 시작 시 main 기준 명시적 type prefix 슬래시 형식 브랜치 생성:
  - `feat/{scope}` — 새 기능 (예: `feat/2-chat-backend`)
  - `chore/{scope}` — 빌드/CI/의존성/설정/계획
  - `fix/{scope}` — 버그 수정
  - `hotfix/{scope}` — 프로덕션 긴급 패치
  - `refactor/{scope}` / `test/{scope}` / `docs/{scope}` — 각각 해당 영역
- Task 완료 시: `git push -u origin <branch>` → `gh pr create --base main --head <branch>`로 PR 생성 (Conventional Commit 제목, Summary + Test plan 본문).
- `--no-verify`, `--force` 등 가드 우회는 사용자 명시 승인 시에만.

## 명령어
```
npm run dev                # 개발 서버 (localhost:3000)
npm run build              # prebuild(check:spec + sync:if-needed + gen:suggestions) → next build
npm run lint
npm run test               # vitest 단발
npm run test:watch
npm run e2e                # Playwright
npm run sync:notion        # 노션 → data/portfolio.server.json (무조건 sync, 이후 data/ 커밋)
npm run sync:if-needed     # prebuild 게이트 — 커밋 데이터 있으면 생략, FORCE_NOTION_SYNC=1 강제
npm run sync:check         # 노션 last_edited_time vs generatedAt 신선도 검사 (STALE 시 exit 1)
npm run gen:suggestions    # portfolio.server.json → 추천 질문 후보 + 관련 질문 매핑
npm run check:spec         # spec.json 유효성 + 모든 FEAT의 tests 파일 존재 검증
```

```
# infra/ CDK 워크스페이스 (ADR-034, 독립 — 자체 npm install)
cd infra && npm run build   # TypeScript 컴파일
cd infra && npm run synth   # CloudFormation 템플릿 합성
cd infra && npm run diff    # 배포된 스택과 diff
cd infra && npm run deploy  # 배포 (AWS 자격 증명 필요)
```

## 파일 절대 규칙
- `.env.local`은 git에 커밋 금지 (`.gitignore` 포함).
- `data/portfolio.server.json`은 **git 커밋 (ADR-030)** — 조건부 sync 의 기반 데이터. 사이트가 이미 공개 서빙하는 콘텐츠이며 사용자가 public 리포 노출을 승인함. `data/embeddings-cache.json` 도 커밋. mini sample 은 `data/portfolio.sample.json` 커밋 유지(CI 폴백).
- `public/data/suggestions.json`은 git 미커밋 — `gen:suggestions` 가 prebuild 마다 커밋된 서버 데이터에서 재생성.
- `spec.json`, `spec.schema.json`은 커밋.
- 노션 토큰은 logs에 절대 출력 금지.

## 현재 워크 컨텍스트
- 소유자: 김윤수 (YoonsooKim9, bbabi0901@gmail.com)
- 컨텐츠 소스: Notion 워크스페이스 (`기록` 페이지 하위 — `기록v2` 는 폐기 예정 트리, 동기화 대상 아님)
- 배포 대상: Vercel
- 시간 기준: KST
