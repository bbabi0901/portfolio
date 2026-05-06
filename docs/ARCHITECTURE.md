# 아키텍처

## 디렉토리 구조 (확정)

```
app/
  layout.tsx                          # 다크 고정, Pretendard, lang=ko, theme-color, JSON-LD, Header/SideSheet/Footer
  page.tsx                            # 채팅 (대화)
  about/page.tsx                      # 자기소개 (SSG)
  experience/page.tsx                 # 회사·프로젝트 타임라인 + 스킬 (SSG)
  contact/page.tsx                    # 폼 + 직접 연락 카드
  not-found.tsx                       # 404
  opengraph-image.tsx                 # 동적 OG (FEAT-019)
  robots.ts                           # robots.txt
  sitemap.ts                          # sitemap.xml
  api/[[...route]]/route.ts           # Hono 엔트리 (chat, feedback, contact, metrics)
  globals.css                         # tailwind base + 커스텀 keyframes
components/
  chat/
    ChatRoot.tsx                      # useChat 래퍼 + greeting 시뮬레이션 연결
    GreetingPlayer.tsx                # 첫 인사 typing 시뮬레이터
    MessageList.tsx
    MessageBubble.tsx                 # typing indicator 분기
    TypingDots.tsx
    Composer.tsx                      # 입력창 + 전송 (IME 3중 체크)
    ModelSwitcher.tsx
    SuggestionCarousel.tsx
    SuggestionBadge.tsx
    FeedbackButtons.tsx
    FeedbackPopover.tsx
    SourceCitation.tsx
    MessageActionsBar.tsx             # Copy / Regenerate / Try-other-model / Open source
    JumpToLatestButton.tsx
    ClearConversationButton.tsx
    RelatedQuestionsChips.tsx         # FEAT-022 P2
    EmptyState.tsx
    ErrorState.tsx
  layout/
    Header.tsx                        # brand + 햄버거
    SideSheet.tsx                     # 슬라이드 메뉴 (focus trap, scroll lock)
    SideMenuItem.tsx
    Footer.tsx
  about/
    AboutHero.tsx
    AboutSection.tsx                  # MDX 래핑
  experience/
    Timeline.tsx
    CompanyGroup.tsx
    ProjectCard.tsx
    SkillsGrid.tsx
    CategoryFilter.tsx
  contact/
    ContactForm.tsx                   # react-hook-form + zod resolver, honeypot
    DirectContactCard.tsx
  ui/                                 # shadcn 생성물
lib/
  models.ts                           # AI SDK 모델 팩토리, 화이트리스트
  retriever.ts                        # 하이브리드 검색
  portfolio-data.ts                   # JSON 로더, 메모리 캐시
  prompts.ts                          # 시스템 프롬프트 빌더
  rate-limit.ts                       # Upstash 또는 메모리 LRU
  spec-schema.ts                      # zod 스키마
  spec-loader.ts                      # spec.json 로드 + 검증
  embeddings.ts                       # 코사인 등 벡터 유틸
  tokenize.ts                         # 한영 토크나이저
  errors.ts                           # 에러 코드 enum + 메시지 매퍼
  output-postprocess.ts               # 외부 URL 마스킹, 시스템 프롬프트 누출 마스킹
  reading-time.ts                     # About 페이지 reading-time
services/
  notion.ts                           # @notionhq/client 래퍼
  openai-embeddings.ts                # 임베딩 호출
  resend.ts                           # 옵션, Contact 알림 이메일
types/
  chat.ts portfolio.ts feedback.ts contact.ts spec.ts
scripts/
  sync-notion.ts                      # 노션 → portfolio.server.json + suggestions.json
  generate-suggestions.ts             # 추천 질문 + 관련 질문 매핑
  validate-spec.ts                    # spec.json 검증
specs/                                # 테스트 (vitest)
  chat-route.spec.ts feedback-route.spec.ts contact-route.spec.ts
  retriever.spec.ts prompts.spec.ts models.spec.ts injection-defense.spec.ts
  spec-schema.spec.ts side-sheet.spec.tsx greeting-player.spec.tsx
  contact-form.spec.tsx carousel.spec.tsx responsive.spec.tsx
tests/
  msw/handlers.ts
  e2e/
    chat.e2e.ts side-menu.e2e.ts about.e2e.ts experience.e2e.ts
    contact.e2e.ts cross-cutting.e2e.ts
  visual/breakpoints.spec.ts
public/
  data/suggestions.json               # 클라이언트용 (slim)
data/                                 # 서버 전용
  portfolio.server.json               # 청크 + 임베딩 (서버에서만 import)
  portfolio.sample.json               # fallback mini sample (커밋)
docs/
  PRD.md ARCHITECTURE.md UI_GUIDE.md ADR.md
  AI_CONTRACT.md NOTION_SCHEMA.md TESTING.md
  CONTENT_GUIDE.md SEO_POLICY.md PAGES.md RESPONSIVE.md TEST_SCENARIOS.md
spec.json
spec.schema.json
CLAUDE.md README.md .env.local.example
```

## 패턴
- **Server Components 기본**: 데이터 로드, 메타, SSG는 서버에서. 인터랙션이 필요한 곳만 `"use client"`.
- **Hono on Route Handler**: `app/api/[[...route]]/route.ts`에 Hono 인스턴스를 마운트. `GET, POST, PATCH` 등 메서드 export로 Next.js Route Handler 인터페이스 충족.
- **Edge vs Node 분리**:
  - Edge runtime: `/api/chat` (스트리밍, 저지연 우선)
  - Node runtime: `/api/feedback`, `/api/contact`, `/api/metrics` (Notion SDK 안정성)
- **데이터 분리**:
  - 서버 전용: `data/portfolio.server.json` (임베딩 포함, ~수 MB)
  - 클라이언트: `public/data/suggestions.json` (~수 KB, 추천 질문 + 프로필 한 줄)
- **상태**:
  - 서버 상태 없음 (stateless API)
  - 클라이언트 채팅 메시지는 `useChat` 내부 (메모리)
  - 모델 선택은 `localStorage.portfolio.model`
  - 첫 인사 표시 여부는 `localStorage.portfolio.greeted` (만료 30일)
- **에러**: 모든 사용자 노출 에러는 `lib/errors.ts`의 enum + 다국어(KR 우선) 메시지 매퍼 통과.

## 데이터 흐름

### 빌드시 1: 노션 동기화 (`scripts/sync-notion.ts`)
```
프로젝트 DB + 화이트리스트 페이지 (이력서, 프로필 페이지들)
  ↓ Notion API (rate-limit safe, exponential backoff x4)
페이지 트리 → 마크다운 (notion-to-md)
  ↓ 청킹 (heading 단위, 500–800 토큰, 코드블록 분할 금지, 페이지당 ≤ 30 청크)
각 청크에 메타 부착 (sourcePageId, sourceTitle, sourceUrl, category, headingPath, tags)
  ↓ OpenAI text-embedding-3-small (배치 100)
임베딩 합쳐 portfolio.server.json 작성
  ↓
공개 안전 영역만 추출 (suggestions, profile 한 줄, 카테고리 카운트)
  ↓
public/data/suggestions.json 작성
```

### 빌드시 2: 추천 질문 생성 (`scripts/generate-suggestions.ts`)
```
portfolio.server.json
  ↓ 휴리스틱 (LLM 미사용)
- 카테고리별 핵심 질문 18개 보장
- 새 카테고리(취미/MBTI 등) 감지 시 자동 추가
- 새 프로젝트(상태=Done) 감지 시 "{프로젝트명} 어떻게 만들었어요?" 추가
  ↓
suggestions.json 갱신 + relatedQuestions[chunkId] 매핑
```

### 런타임 1: 채팅 (`/api/chat` Edge)
```
사용자 입력 (POST)
  ↓ zod 검증 (메시지 길이, 모델 ID, role)
  ↓ rate limit (Upstash 또는 메모리)
  ↓ 일별 토큰 한도 체크
retriever.search(latestUserMessage)
  ├ 키워드 매칭 (lib/tokenize)
  ├ 임베딩 코사인 (lib/embeddings)
  └ 머지 (a=0.4 / b=0.6, top-K=8, ≤ 6000 토큰)
prompts.build(systemPrompt, retrievedChunks)
  ↓ ai.streamText({ model, system, messages, temperature: 0.3, maxOutputTokens: 1024 })
SSE 스트리밍 → 클라이언트
  ↓ output-postprocess (외부 URL 마스킹, 시스템 프롬프트 누출 검출)
끝.
```

### 런타임 2: 피드백 (`/api/feedback` Node)
```
사용자 👎 클릭 → popover 입력
  ↓ POST /api/feedback (zod 검증, rate limit)
services.notion.appendFeedbackRow(...)
  ↓ Notion API (1회 재시도)
200 → 클라이언트 토스트
```

### 런타임 3: Contact 폼 (`/api/contact` Node)
```
사용자 폼 제출
  ↓ react-hook-form + zod 클라이언트 검증
  ↓ POST /api/contact
서버 zod 재검증 + rate limit + honeypot + 시간 임계 (≥ 1.5s)
  ↓ services.notion.appendContactRow(...)
  ↓ (옵션) services.resend.notifyOwner(...)
200 → 토스트, 폼 reset
```

## 상태 머신 (채팅 세션)
```
idle
  ── user submit ──▶ submitting
submitting
  ── streaming start ──▶ streaming
  ── 4xx/5xx ──▶ error
streaming
  ── stream done ──▶ done
  ── stream abort (route change | new submit | clear) ──▶ idle
  ── stream error ──▶ error
error
  ── retry ──▶ submitting
  ── ignore ──▶ idle
done
  ── new user submit ──▶ submitting
```

## 모듈 의존성 그래프 (텍스트)
```
app/page (Chat)
  → components/chat/ChatRoot
    → @ai-sdk/react useChat
    → /api/chat
  → components/chat/GreetingPlayer
  → components/chat/SuggestionCarousel ← public/data/suggestions.json
  → components/chat/MessageList → MessageBubble (TypingDots, MessageActionsBar)
  → components/chat/Composer
  → components/chat/ModelSwitcher
  → components/chat/FeedbackButtons → /api/feedback

/api/chat (Edge)
  → lib/spec-loader (validate at startup)
  → lib/rate-limit
  → lib/portfolio-data → data/portfolio.server.json
  → lib/retriever (lib/tokenize, lib/embeddings)
  → lib/prompts
  → lib/models → ai SDK
  → lib/output-postprocess

/api/feedback (Node)
  → services/notion (Q&A 피드백 DB)

/api/contact (Node)
  → services/notion (Contact DB)
  → services/resend (옵션)

scripts/sync-notion (Node, build-time)
  → services/notion
  → services/openai-embeddings
  → data/portfolio.server.json + public/data/suggestions.json

scripts/generate-suggestions (Node, build-time)
  → data/portfolio.server.json
  → public/data/suggestions.json

app/about (RSC)  → MDX (빌드시 노션→MDX 변환물 import)
app/experience (RSC) → data/portfolio.server.json (서버 import)
app/contact (RSC) → ContactForm (Client)

app/layout (RSC) → Header (Client: 햄버거) → SideSheet (Client)
                  → Footer (RSC)
```

## 빌드 산출물 정책
- `data/portfolio.server.json`: 서버 전용. Vercel 배포 시 함수 번들에 inlined되도록 import.
- `public/data/suggestions.json`: 정적 자산, CDN 캐시 immutable + 빌드별 fingerprint.
- 클라이언트 번들에 임베딩(1536 차원 number array) 패턴이 0건이어야 함 (CI grep 검증).

## 환경변수
[.env.local.example](../.env.local.example) 참조. 누락 시 동작:
- `OPENAI_API_KEY`: 채팅/임베딩 둘 다 차단 → /api/chat 503
- `ANTHROPIC_API_KEY` 누락: Anthropic 모델 비활성, GPT/Gemini만 노출
- `GOOGLE_GENERATIVE_AI_API_KEY` 누락: Gemini 비활성
- `NOTION_TOKEN` 누락: 빌드 실패
- `NOTION_PROJECTS_DB_ID` 누락: 빌드 실패
- `NOTION_FEEDBACK_DB_ID` 누락: 피드백 비활성 (UI 버튼 hidden)
- `NOTION_CONTACT_DB_ID` 누락: Contact 폼 503 + "직접 메일 주세요" mailto 노출
- `RESEND_API_KEY` 누락: 알림 silent 생략
- `UPSTASH_*` 누락: 메모리 LRU 폴백
- `MAX_TOKENS_PER_DAY` 누락: 기본 200000
- `RATE_LIMIT_BYPASS=1`: 개발 환경에서 한도 무시

## 운영/관측
- Vercel 빌드 로그 + 함수 로그(JSON 구조).
- 로그 필드: `ts, route, ip(hashed sha256 앞 8자), model, retrievalMode, latencyMs, tokensIn, tokensOut, status`.
- 사용자 토큰 누적: 일별 메모리 카운터 (분산 시 부정확하지만 best-effort), 정확한 값은 Upstash 사용시.
- 알림: 일별 토큰 cap 80% 도달 시 Vercel log alert.

## 보안 표면
- 모든 API 라우트에 zod 입출력 검증.
- 인젝션 방어 5종 + 출력 후처리(외부 URL/시스템 프롬프트 누출 마스킹).
- Honeypot + 시간 임계 + IP rate limit (Contact).
- CSP: default-src 'self'; img-src 'self' data: https://prod-files-secure.s3.us-west-2.amazonaws.com (노션 이미지). LLM 응답 내 외부 링크는 사전 마스킹.
- CORS: same-origin만.
- 노션 토큰은 Edge에 배포되지 않음 (Edge에는 portfolio.server.json만, Notion API 직접 호출은 Node 라우트에서만).

## 성능 목표
- 첫 토큰 TTFB p50 < 1.5s.
- About/Experience 정적 페이지: TTFB < 200ms (Vercel CDN).
- LCP < 2.5s, CLS < 0.1, INP < 200ms.
- 클라이언트 JS 번들: gzipped < 250KB.
