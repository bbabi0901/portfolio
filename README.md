# AI Portfolio (김윤수)

채용 담당자/동료 개발자가 자연어로 김윤수의 커리어·프로젝트·기술을 물어보면 **노션 기록 기반**으로 답하는 사이트.

레퍼런스: [dewdew.dev/ai](https://www.dewdew.dev/ai). 우리는 같은 컨셉을 **인프라 없이**(서버리스 + 빌드시 정적 RAG) 구현한다.

## 데모 / 기능 한눈에
- 멀티 모델 채팅 (GPT-4o-mini / Claude 3.5 Haiku / Gemini 2.0 Flash)
- SSE 스트리밍 + typing indicator
- 노션에서 빌드시 콘텐츠 동기화
- 추천 질문 carousel (badge)
- 답변 피드백(👎) → 노션 "Q&A 피드백" DB 자동 적재
- 햄버거 사이드 메뉴 (대화 / 자기소개 / 커리어 / 연락하기)
- Contact 폼 (이름/이메일/메시지, honeypot + rate limit)
- 모바일/태블릿/데스크톱 반응형

## 기술 스택
Next.js 16 (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui · Hono · Vercel AI SDK · @notionhq/client · Vitest · Playwright

자세한 의사결정: [docs/ADR.md](docs/ADR.md).

## 빠르게 시작

```bash
# 1) 의존성
npm ci

# 2) 환경변수
cp .env.local.example .env.local
# OPENAI_API_KEY, NOTION_TOKEN, NOTION_PROJECTS_DB_ID, NOTION_PROFILE_PAGE_IDS 등 채우기

# 3) 노션 동기화 (콘텐츠 → 정적 JSON + 임베딩)
npm run sync:notion

# 4) 개발 서버
npm run dev
```

http://localhost:3000

## 명령어

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (localhost:3000) |
| `npm run build` | prebuild(sync:notion + gen:suggestions) → next build |
| `npm run start` | 프로덕션 빌드 실행 |
| `npm run lint` | ESLint |
| `npm run test` | Vitest 단발 |
| `npm run test:watch` | Vitest watch |
| `npm run e2e` | Playwright E2E |
| `npm run sync:notion` | 노션 → `data/portfolio.server.json` + `public/data/suggestions.json` |
| `npm run gen:suggestions` | 추천 질문 + 관련 질문 매핑 |
| `npm run check:spec` | spec.json 유효성 + 테스트 매핑 검증 |
| `npm run audit:bundle` | 클라이언트 번들 감사 (임베딩 누출 0건) |
| `npm run lhci` | Lighthouse CI |

## 환경변수

[.env.local.example](.env.local.example) 참조. 각 변수의 누락 시 동작은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#환경변수)에 명시.

## 디렉토리

```
app/                 페이지 + API (Hono)
components/          UI (chat / layout / about / experience / contact / ui)
lib/                 도메인 로직 (retriever, prompts, models, …)
services/            외부 API 래퍼 (notion, openai-embeddings, resend)
scripts/             빌드 스크립트 (sync-notion, generate-suggestions)
data/                서버 전용 산출물 (portfolio.server.json, sample)
public/data/         클라이언트 안전 산출물 (suggestions.json)
specs/               단위·통합·컴포넌트 테스트 (vitest)
tests/               msw 핸들러, E2E, 시각 회귀
docs/                문서 (PRD, ARCHITECTURE, ADR, …)
spec.json            서비스 스펙 SSoT
```

자세한 트리: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#디렉토리-구조-확정).

## 문서 가이드

| 파일 | 내용 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 코드베이스 작업 최우선 규칙 |
| [docs/PRD.md](docs/PRD.md) | 목표·페르소나·기능 요약·성공지표 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 디렉토리·런타임·데이터 흐름·상태 머신·의존성 그래프 |
| [docs/UI_GUIDE.md](docs/UI_GUIDE.md) | 색·폰트·컴포넌트·애니메이션·a11y |
| [docs/ADR.md](docs/ADR.md) | 24개 결정 + 트레이드오프 |
| [docs/AI_CONTRACT.md](docs/AI_CONTRACT.md) | 시스템 프롬프트·인젝션 방어·출력 후처리 |
| [docs/NOTION_SCHEMA.md](docs/NOTION_SCHEMA.md) | 화이트리스트·청킹·DB 스키마 |
| [docs/TESTING.md](docs/TESTING.md) | TDD 워크플로우·커버리지·msw |
| [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) | 소유자용 노션 작성 가이드 |
| [docs/SEO_POLICY.md](docs/SEO_POLICY.md) | meta·OG·sitemap·JSON-LD |
| [docs/PAGES.md](docs/PAGES.md) | 페이지별 와이어프레임·콘텐츠·엣지 |
| [docs/RESPONSIVE.md](docs/RESPONSIVE.md) | breakpoint·컴포넌트 변형·디바이스 매트릭스 |
| [docs/TEST_SCENARIOS.md](docs/TEST_SCENARIOS.md) | TS-01~70 사용자 플로우 시나리오 |

## 노션 사전 준비 (소유자)

자세한 절차: [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md). 요약:

1. https://www.notion.so/my-integrations 에서 봇 토큰 발급.
2. 다음 페이지/DB를 봇에 공유:
   - 프로젝트 DB
   - 김윤수 이력서 페이지
   - (선택) 자기소개/MBTI/취미 페이지
3. 노션에 다음 DB 신설 (스키마는 [docs/NOTION_SCHEMA.md](docs/NOTION_SCHEMA.md)):
   - "Q&A 피드백" DB
   - "Contact" DB
4. 각 ID를 `.env.local`에 입력.

## 배포 (Vercel)

1. Vercel에 GitHub 연결.
2. 환경변수 입력 (Production / Preview).
3. 배포. `prebuild`가 자동으로 노션 동기화.
4. (옵션) GitHub Action: 매일 1회 Redeploy 트리거.

## 라이선스

본 코드와 콘텐츠는 김윤수 개인 포트폴리오 용도. 무단 복제/배포 금지.

## 연락
- 이메일: bbabi0901@gmail.com
- GitHub: [@YoonsooKim9](https://github.com/YoonsooKim9)
