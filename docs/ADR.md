# Architecture Decision Records
<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, CLAUDE.md, ARCHITECTURE.md, PRD.md
**SSoT keys**: (없음 — 의사결정 로그 자체가 SSoT)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

## 철학
MVP 속도 + 외부 의존성 최소 + 운영 부담 0 + 디테일은 spec.json으로 강제. 의사결정은 명시적으로 적고, 트레이드오프를 숨기지 않는다.

---

### ADR-001: Next.js 16 + App Router
**결정**: Next.js 16 App Router를 채택한다.
**이유**: RSC 기본, Edge runtime 지원, 정적/동적 혼용 페이지 자유도, Vercel 1급 호환, Turbopack(이력서에 기여한 경험과 일관).
**트레이드오프**: Pages Router로 가능한 일부 라이브러리 호환성 제한. RSC 학습 곡선.

### ADR-002: Hono on Route Handler
**결정**: `app/api/[[...route]]/route.ts`에 Hono 인스턴스를 마운트하여 모든 API 라우팅을 한 곳에서 처리한다.
**이유**: 미들웨어/검증/라우팅 표현이 Next 기본 핸들러보다 깔끔. 경험 자산(밈코인 어드민에서 검증).
**트레이드오프**: Next 라우트 컨벤션과 살짝 어긋남, Edge runtime 호환성 확인 필요.

### ADR-003: Vercel AI SDK (멀티 프로바이더)
**결정**: `ai` + `@ai-sdk/openai|anthropic|google`로 추상화. `streamText` 사용.
**이유**: 모델 스왑 1줄, SSE 스트리밍 표준화, useChat 훅 호환.
**트레이드오프**: 각 SDK가 SDK 별 미세 옵션 차이 보임. 추상화에 갇혀 특정 모델만의 기능 활용이 늦어질 수 있음.

### ADR-004: 빌드시 정적 JSON RAG (Supabase/벡터DB 미사용)
**결정**: 청크 + 임베딩을 빌드 산출물(`data/portfolio.server.json`)로 만들고 Edge에서 메모리 코사인 검색.
**이유**: 데이터량 작음(수백 청크). 벡터 DB 운영 부담 0, 비용 0. 결정성↑.
**트레이드오프**: 콘텐츠가 1만 청크 이상으로 늘면 메모리/지연 부담. 그 경우 Supabase pgvector로 마이그.

### ADR-005: 노션을 단일 콘텐츠 소스
**결정**: 콘텐츠는 노션에서만 작성. CMS 없음.
**이유**: 사용자가 이미 노션을 일상적으로 사용. 별도 CMS 학습/운영 0.
**트레이드오프**: 노션 API 구조에 의존. 비공개 페이지 노출 사고 위험 → 화이트리스트로 통제.

### ADR-006: shadcn/ui (코드 복사 패턴)
**결정**: Radix 기반 컴포넌트를 shadcn으로 프로젝트 내 코드로 복사.
**이유**: 의존성 최소, 커스터마이즈 자유도, Radix 접근성 표준.
**트레이드오프**: 라이브러리 자동 업데이트 안 됨 → 수동 sync.

### ADR-007: Tailwind only (Sass 미사용)
**결정**: Sass/SCSS 사용하지 않는다.
**이유**: 단일 스타일 시스템, 클래스 중심 가독성, Tailwind 4의 native CSS variables로 충분.
**트레이드오프**: 복잡한 keyframes는 globals.css에 직접 작성.

### ADR-008: 다크 모드 only
**결정**: 라이트 모드 토글 없음. 다크 고정.
**이유**: 디자인 일관성, 개발자 사용자 다수가 다크 선호. 토글 구현/검증 비용 회피.
**트레이드오프**: OS가 라이트 선호 사용자에게 mismatch 인상. 단 색 대비는 WCAG AA 준수.

### ADR-009: stateless chat
**결정**: 대화 히스토리를 서버에 저장하지 않는다. 클라이언트 메모리만.
**이유**: 인증 없음, 운영 부담 0, 개인정보 노출 면적 0.
**트레이드오프**: 새로고침 시 대화 사라짐. 명시.

### ADR-010: spec.json 채택 (SDD)
**결정**: 서비스 스펙을 단일 JSON으로 관리. 신기능은 spec → test → code 순서.
**이유**: 디테일 누락 방지. 문서·코드·테스트 정합성을 자동 검증 가능.
**트레이드오프**: 작은 변경에도 spec 갱신 부담. 단 완성된 서비스의 일관성·검증성에 비하면 작음.

### ADR-011: Vitest + Testing Library + msw + Playwright (TDD)
**결정**: 단위·통합·컴포넌트는 Vitest + RTL + msw, E2E/시각 회귀는 Playwright.
**이유**: 빠른 테스트 루프, msw로 외부 API 결정성, Playwright 디바이스 프리셋.
**트레이드오프**: Jest 자산 재활용 불가(필요 시 마이그). 단 본 프로젝트는 그린필드.

### ADR-012: 인젝션 방어 = 시스템 프롬프트 + 출력 후처리 (이중 방어)
**결정**: (1) system prompt에 강한 룰. (2) 응답 후처리에서 외부 URL 마스킹 + 시스템 프롬프트 키워드 누출 마스킹.
**이유**: LLM은 룰을 어길 수 있음. 후처리는 결정성 보장.
**트레이드오프**: 후처리가 과하면 false positive. 화이트리스트 도메인만 살림.

### ADR-013: 피드백 저장소 = 노션 (대안 비교)
**결정**: 👎 피드백을 노션 "Q&A 피드백" DB에 저장.
**이유**: 소유자가 이미 노션을 사용. 별도 인프라 0. 노션 모바일 알림으로 알람.
**대안 비교**:
- GitHub Issue: 좋지만 공개 저장소 시 사적 피드백 노출, 토큰 분리 부담.
- Resend(이메일): 알림은 가능하나 이력 관리 노션 대비 약함.
- Slack webhook: 실시간성 우수, 단 운영자 채널 필요.
**트레이드오프**: Notion API rate limit (3 req/sec), 다운 시 fallback 필요 → 1회 재시도 + Resend 폴백 + mailto.

### ADR-014: Edge runtime / Node runtime 분리 정책
**결정**: `/api/chat`은 Edge, `/api/feedback`·`/api/contact`은 Node.
**이유**: 채팅은 SSE 스트리밍 저지연 우선. 노션/Resend는 Node SDK 안정성 우선.
**트레이드오프**: 두 런타임 관리 부담. 그러나 Hono의 어댑터로 표현 통일 가능.

### ADR-015: Embla 기반 carousel
**결정**: shadcn carousel(=Embla 기반) 사용.
**이유**: 가벼움(~9KB), 키보드/터치/스냅 표준.
**트레이드오프**: 자체 구현 대비 의존성 1개 추가.

### ADR-016: 일별 토큰 상한으로 비용 cap
**결정**: `MAX_TOKENS_PER_DAY` 환경변수로 일별 상한 → 초과 시 503.
**이유**: 사용량 폭증 시 비용 0~소액 보장.
**트레이드오프**: 합법적인 사용도 차단 가능. 알림 기준 80%로 사전 인지.

### ADR-017: Contact 저장소 = Notion + 옵션 Resend 알림
**결정**: Contact 폼은 노션 "Contact" DB에 저장. `RESEND_API_KEY` 있으면 자기 메일에 알림.
**이유**: 단일 ToS, 운영 부담 최소.
**대안**: Formspree/Getform 등 폼 SaaS — 외부 의존 추가 불필요.
**트레이드오프**: 노션 다운 시 사용자에게 mailto 폴백 필수 (구현 포함).

### ADR-018: 봇 보호 = honeypot + 시간 임계 + IP rate limit
**결정**: 1차 honeypot, 2차 진입~제출 ≥ 1.5s, 3차 IP rate limit. Cloudflare Turnstile은 P2.
**이유**: 99% 봇 차단 + UX 영향 0.
**트레이드오프**: 매우 빠른 키보드 사용자 false positive 가능 → 1회 시도 후 captcha 옵션.

### ADR-019: 라우팅 = App Router 4 페이지 + 공통 layout
**결정**: `/`, `/about`, `/experience`, `/contact` + 공통 Header/SideSheet/Footer.
**이유**: 본질이 다른 4개의 정보 영역. URL로 직접 진입 가능해 SEO 유리.
**트레이드오프**: 페이지 간 상태 공유 안 됨 → 채팅 상태는 stateless로 일치.

### ADR-020: 사이드 메뉴 = shadcn Sheet (모바일 풀스크린, 데스크톱 320px)
**결정**: `<Sheet side="right">`. 모바일은 width 100vw로 override.
**이유**: focus trap/scroll lock/Esc 닫기 표준. 모바일 풀스크린이 폰 사용성에 더 자연스러움.
**트레이드오프**: 데스크톱 폭 320px이 좁다고 느낄 수 있으나, 메뉴는 짧음.

### ADR-021: 첫 인사 = spec.json 정적 텍스트의 시뮬레이션 스트리밍
**결정**: LLM 호출 없이 정해진 인사 텍스트를 typing dots → 단어 누적으로 표시.
**이유**: 비용 0, 결정성↑, 시각적 동일.
**트레이드오프**: 인사 텍스트 변경 시 spec.json 수정 필요(좋음 — 의도적 변경 추적).

### ADR-022: 클라이언트/서버 데이터 분리 (suggestions vs portfolio.server)
**결정**: 임베딩은 서버 전용, 클라이언트는 추천 질문 + 프로필 한 줄만.
**이유**: 보안(임베딩으로 컨텐츠 추정 가능 우려 + 사이즈), 성능.
**트레이드오프**: 빌드 산출물 2개 관리.

### ADR-023: 시간/지역 = KST 고정
**결정**: 표시·로그 모두 KST.
**이유**: 소유자/주요 방문자가 한국. UTC ↔ KST 변환 혼란 회피.
**트레이드오프**: 글로벌 사용자에게 시차 인지 부담. 단 사이트 본질에 큰 영향 없음.

### ADR-024: i18n = 자동 감지 only (MVP)
**결정**: 명시 토글 없음. 영어 질문은 영어로 답.
**이유**: 한국어 우선 사용자, 토글 구현 부담 회피.
**트레이드오프**: 언어 전환의 사용자 통제 약함. 추후 토글 옵션.

### ADR-025: Vercel AI Gateway 도입 (멀티 LLM 통합 결제)
**결정**: Vercel AI Gateway(`AI_GATEWAY_API_KEY`)를 1차 LLM 라우터로 도입. 직접 provider 키(OPENAI/ANTHROPIC/GOOGLE)는 fallback으로 유지.
**이유**:
- OpenAI/Anthropic/Google 3개 서비스를 각각 구독·결제·키 관리하는 번거로움 제거
- Vercel 계정 하나로 통합 결제 (0% 마진, 제공자 정가)
- `ai@6`의 `gateway()` 함수는 drop-in 호환 — `lib/models.ts` 1개 파일 수정으로 완료
- `$5/월 무료 크레딧` 포함, 소규모 트래픽에 충분
**코드 변경**:
- `lib/env.ts` — `AI_GATEWAY_API_KEY` 필드 추가
- `lib/models.ts` — `createModel()`: Gateway key 있으면 `gateway("provider/model")`, 없으면 직접 키 fallback
- `lib/models.ts` — `listAvailableModels()`: Gateway key 있으면 모든 모델 활성, 없으면 직접 키 기준 필터
**트레이드오프**:
- Vercel 플랫폼 의존도 증가. 단 직접 키 fallback이 있으므로 탈출 경로 존재.
- Gateway 다운 시 직접 키로 전환 필요 — `AI_GATEWAY_API_KEY` 제거 또는 직접 키 설정으로 대응.
**활성화 방법**: Vercel 대시보드 > Storage > AI Gateway > Enable → `AI_GATEWAY_API_KEY` 발급 → `.env.local` 및 Vercel 환경변수에 추가.

---

### ADR-026: OpenRouter 도입 (Vercel AI Gateway 대체)
**결정**: LLM 라우터를 Vercel AI Gateway(`AI_GATEWAY_API_KEY`)에서 OpenRouter(`OPENROUTER_API_KEY`)로 교체.
**이유**:
- Vercel AI Gateway는 BYOK(Bring Your Own Key) 구조 — OpenAI/Anthropic/Google 각 키를 Vercel 대시보드에 별도 등록해야 함
- OpenRouter는 진정한 단일 키 서비스 — 하나의 `OPENROUTER_API_KEY`로 100+ 모델 즉시 사용 가능
- 저렴한 요금: gpt-4o-mini $0.15/1M, claude-3-5-haiku $0.80/1M, gemini-2.0-flash $0.10/1M (공급자 정가 수준)
- Vercel 플랫폼 lock-in 없음
**구현**:
- `lib/models.ts` — `createOpenAI(baseURL: "https://openrouter.ai/api/v1")` + `HTTP-Referer`/`X-Title` 헤더
- `lib/env.ts` — `AI_GATEWAY_API_KEY` 제거, `OPENROUTER_API_KEY` 추가, `OPENAI_API_KEY` 임베딩 전용으로 분리
- 모델 ID: `"openai/gpt-4o-mini"`, `"anthropic/claude-3-5-haiku"`, `"google/gemini-2.0-flash-exp"`
**중요 제약**:
- **OpenRouter는 `/v1/embeddings` 미지원** — `sync:notion` 임베딩은 `OPENAI_API_KEY` (직접 OpenAI) 사용 유지
- 임베딩은 빌드 타임에만 실행 (`npm run sync:notion`). 런타임 채팅에는 불필요.
- **`@ai-sdk/openai v3+`는 `or(modelId)` 호출 시 Responses API(`/v1/responses`)를 기본 사용한다.** OpenRouter는 Chat Completions API만 지원하므로 반드시 **`or.chat(modelId)`** 로 호출할 것. `or(modelId)` 단독 호출 금지. 이를 어기면 모든 실제 LLM 호출이 무음으로 실패하며 빈 응답이 반환된다.
**트레이드오프**:
- 임베딩 때문에 `OPENAI_API_KEY` 를 완전히 제거할 수 없음. 그러나 임베딩은 빌드 시에만 발생하고 비용이 매우 저렴($0.02/1M tokens). 런타임은 100% `OPENROUTER_API_KEY` 하나로 동작.

---

### ADR-027: 라이트/다크 테마 도입 (다크 고정 폐지)
**결정**: 기존 "다크 모드 only" 정책을 폐지하고 라이트/다크 테마를 시맨틱 CSS 변수 체계로 정식 지원.
**이유**:
- 사용자 요청. 다크 고정은 접근성·선호 다양성 측면에서 제약.
- 색상이 하드코딩 Tailwind 클래스(`bg-neutral-900` 등 48개 파일·~260곳)로 퍼져 있어 테마 전환 불가 상태였음.
**구현**:
- `app/globals.css` — `:root`(라이트)·`.dark` CSS 변수 + Tailwind v4 `@theme inline`으로 유틸 생성. 시맨틱 토큰: `background/surface/elevated`, `foreground/body/muted/subtle/faint`, `line/line-strong/line-subtle`, `brand/brand-foreground`, `danger/warning/success`. shadcn 표준 토큰(`primary/card/popover/accent/input/ring/muted-foreground/destructive`)도 팔레트에 매핑.
- 하드코딩 색 전부 시맨틱 유틸로 마이그레이션. 반전 요소는 `bg-foreground text-background`. 마크다운은 `prose dark:prose-invert`.
- `next-themes` `ThemeProvider`(attribute="class", defaultTheme="system", enableSystem). `<html>` 고정 클래스 제거 + `suppressHydrationWarning`.
- 토글 UI: `components/theme/ThemeToggle.tsx`(시스템/라이트/다크 세그먼트) — 사이드바(SideSheet) 하단.
- `viewport.themeColor`: 라이트 `#ffffff`/다크 `#0a0a0a` media 쌍, `colorScheme: "light dark"`.
**중요 제약**:
- **하드코딩 Tailwind 색 금지** — 신규 UI는 반드시 시맨틱 토큰 유틸 사용(docs/UI_GUIDE.md 참조). 어기면 한쪽 테마에서 깨짐.
- 브랜드 lime은 `brand` 토큰(shadcn `accent`와 충돌 방지 위해 분리). shadcn `accent`는 중립 hover.
**트레이드오프**:
- 토큰 체계로 유지보수성↑, 초기 마이그레이션 비용은 컸음(48파일). prose 등 서드파티 스타일은 `dark:` variant 병행 필요.

---

## ADR-028: Notion sync 견고성 — 제목/카테고리 추출 + 청커 merge 상한 + 동시성

**결정**: 현재 노션 콘텐츠 구조(독립 페이지 이력서, multi_select 카테고리, columns/callout)에서 sync 가
career/project 콘텐츠를 누락하던 문제를 아래로 수정한다.

- **제목 추출**(`services/notion.ts` `extractTitle`): 명시적 키(`이름/Name/Title`) 다음, `title` 타입 속성
  아무거나 fallback. 독립(child) 페이지의 소문자 `title` 속성을 못 읽어 이력서가 `(untitled)` → `career`
  아닌 `personal` 로 오분류되던 버그 해결.
- **카테고리 multi_select**(`extractSelectLike`): `select/status` 외 `multi_select`(프로젝트 DB "카테고리")도
  첫 옵션명으로 인식. 미지원 시 프로젝트 전량 필터아웃(project 0)되던 문제 해결.
- **청커 merge 상한**(`lib/chunking.ts`): 짧은 섹션을 직전 청크에 머지하되 `targetTokens(600)` 초과 시 중단.
  상한이 없으면 헤딩만 있고 본문이 짧은 섹션(이력서의 경력/학력 항목)들이 한 청크로 흡수돼 회사·학교명
  heading 이 소실됨.
- **fetch 동시성 4→2**(`scripts/sync-notion.ts`): notion-to-md 의 중첩 블록 자식 fetch 가 rate-limit 로
  조용히 부분 수신되어 큰 페이지(이력서)가 비결정적으로 잘리던 현상 완화.

**결과**: 이력서 career 청크 3→16(교육/학력 청크 포함), 프로젝트 0→147 청크(자체 소개 페이지 포함). `/about`
학력 섹션 렌더 + "이 프로젝트 어떻게 만들었어요?" RAG 답변 근거 확보.

**트레이드오프**: 동시성↓ 로 sync 시간 소폭 증가. multi_select 는 첫 옵션만 사용(복수 카테고리 행은 첫 값 기준).

---

## ADR-029: 빌드타임 임베딩 캐시 (embeddings-cache.json)

**배경**: ADR-028 로 sync 가 career/project 를 정상 포함하면서 청크 수가 크게 증가(≈240). 빌드마다
전량 재임베딩하면 Voyage 무료 티어 rate-limit(3 RPM·소량 배치)에 걸려 `npm run build` prebuild 가 실패
(`OpenAI embeddings rate-limited after 6 attempts`)해 Vercel 운영 배포가 깨진다.

**결정**: 청크 텍스트(+provider/model 네임스페이스) 해시를 키로 임베딩 벡터를 `data/embeddings-cache.json`
에 보관하고 **git 에 커밋**한다. `scripts/sync-notion.ts` 는 캐시 미스인 청크만 임베딩(소그룹 단위 증분 저장,
rate-limit 로 중단돼도 재실행 시 이어서 채움)하고, 나머지는 캐시 재사용.
- `lib/embeddings-cache.ts`: `embeddingCacheKey(namespace, text)`(sha256), `load/saveEmbeddingsCache`.
- 네임스페이스 = `${model}@${dims}` — provider/model 변경 시 캐시 자동 무효화(벡터 공간 불일치 방지).
- `.prettierignore` 에 캐시 파일 추가(대용량 compact JSON 재포맷 방지).

**효과**: 캐시가 커밋돼 있으면 Vercel 빌드는 임베딩 API 호출 0회(전량 히트)로 즉시 성공. 콘텐츠가 바뀐
청크만 소량 임베딩. 최초 완전 생성만 쿼터가 필요하며, 이후 배포는 rate-limit 무관.

**운영 노트**: 캐시 최초 생성은 임베딩 쿼터가 있는 상태에서 `npm run sync:notion` 을 완료해 생성된
`data/embeddings-cache.json` 을 커밋해야 한다. 커밋 전까지는 빌드가 라이브 임베딩(=rate-limit 취약)에 의존.

**트레이드오프**: 캐시 파일이 커밋되어 리포 용량 증가(≈수백 KB~수 MB). 청크 텍스트 변경 시 해당 항목 재임베딩.

---

## ADR-030: 커밋형 RAG 데이터 + 조건부 노션 sync

**배경**: prebuild 가 빌드마다 무조건 `sync:notion` 을 실행해 (1) 노션이 안 바뀐 배포에도 API 왕복이
발생하고, (2) 임베딩 rate-limit(ADR-029 배경)이 배포 실패 요인으로 남아 있었다. 사용자 요구:
"배포 시 요청하거나 필요하다고 판단될 때만 sync".

**결정**:
1. `data/portfolio.server.json` 을 **git 에 커밋**한다 (`.gitignore` 에서 제거). `route.ts` 의 정적
   import 가 커밋 파일로 항상 충족되므로 sync 없는 빌드가 성립한다. `data/embeddings-cache.json`
   (ADR-029)도 함께 커밋.
   - 공개 리포 노출 트레이드오프: 파일에 이력서 전문·연락처가 포함되나 동일 내용이 이미 사이트
     (/about, 챗봇)로 공개 서빙 중 — **사용자 승인 완료**.
2. prebuild 를 `sync:if-needed` 게이트로 교체 (`scripts/sync-if-needed.ts`, FEAT-033):
   `SKIP_NOTION_SYNC=1`(생략, CI) > `FORCE_NOTION_SYNC=1`(강제) > 데이터 부재(안전망 sync) > 생략.
   `npm run sync:notion` 직접 실행은 기존대로 무조건 sync.
3. 신선도 판단용 `npm run sync:check` (`scripts/check-notion-freshness.ts` + `lib/notion-freshness.ts`):
   소스 4종의 refs 만 조회(콘텐츠 fetch 없음)해 `last_edited_time`(신규 캡처, `services/notion.ts`) 의
   최대값을 `generatedAt` 과 비교. STALE 이면 exit 1 + 변경 페이지 목록.
4. 반영 플로우: 노션 수정 → `sync:check`(판단) → `sync:notion` → `data/` 커밋 → 푸시(=배포).
   suggestions.json 은 순수 로컬 변환이라 prebuild 에서 계속 재생성(미커밋 유지).

**효과**: Vercel 빌드는 노션/임베딩 API 0회 — 결정적·빠름·쿼터 무관. 노션 반영은 명시적 커밋으로
추적 가능(어떤 콘텐츠 스냅샷이 배포됐는지 git 이력에 남음).

**트레이드오프**: sync 마다 server.json 대형 diff(수 MB), 노션 수정이 자동 반영되지 않음(의도된 동작 —
sync:check 로 판단). 페이지 삭제는 last_edited_time 으로 감지 불가 → 삭제 반영은 강제 sync.

---

## ADR-031: /api/chat Edge → Node 런타임 이전

**배경**: ADR-030 으로 `data/portfolio.server.json`(271 청크, 임베딩 포함 ~수 MB)을 커밋하고
Edge 라우트가 이를 정적 import 하자 Vercel 배포가 `Edge Function "api/[[...route]]" size is 1 MB
and your plan size limit is 1 MB` 로 실패.

**결정**: `/api/chat`(catch-all Edge 라우트)을 `runtime = "nodejs"` 로 이전. Node 함수는 번들
한도 50MB, Vercel AI SDK 스트리밍(SSE) 지원. 콘텐츠 증가에도 여유.

**트레이드오프**: Edge 대비 콜드스타트 소폭 증가. 대안(임베딩 분리 slim JSON)은 타입·테스트
파급이 커서 보류 — 런타임 벡터 검색 도입 시 재검토.

## ADR-032: 커리어 타임라인 소스를 노션 이력서로 단일화

**배경**: 통합 타임라인(#44)은 이력서(career 청크) 회사 경력 + 프로젝트 DB(project 청크,
notionCategory=자체프로젝트)를 병합했다. 그런데 프로젝트 DB에는 실제 프로젝트 페이지
("AI 포트폴리오 (대화형 포트폴리오)") 외에 Q&A 피드백·Contact 운영 DB를 담는 컨테이너 row
("대화형 포트폴리오")가 같은 카테고리(자체프로젝트)·상태(In progress)로 존재해 sync 필터를
통과 → 운영 커리어 페이지에 "자체 프로젝트"가 중복 노출됐다. 설명(impact)도 청크 알파벳순
첫 청크에서 뽑혀 본문 코드 설명이 노출되는 문제가 겹쳤다.

**결정**: 커리어 타임라인은 **이력서 페이지 단일 소스**. 자체 프로젝트도 이력서의
"자체 프로젝트 (Personal Project)" 섹션에 회사 항목과 같은 포맷(callout `| 자체 프로젝트`
— 역할 라인 없음 + quote 기간 + divider + `###` 프로젝트명 + 불릿)으로 기록하고,
`CAREER_TIMELINE_HEADING_RE` 가 해당 섹션을 포함하도록 확장. `buildUnifiedTimeline` 은
careerBody 만 받아 파싱·시작일 내림차순 정렬 (personal kind·project 청크 병합 제거).
역할 미기재 항목의 "소프트웨어 엔지니어" 폴백도 제거 (자체 프로젝트에 직함 미노출).

**트레이드오프**: 타임라인의 태그 칩·노션 링크(project 청크 유래)는 사라짐 — 이력서 불릿이
동일 정보를 문장으로 전달. project 청크는 RAG 채팅 답변용으로 유지되므로 컨테이너 row 정리는
별도 과제. 노션 캘아웃은 **built-in 아이콘**(briefcase)을 써야 함 — 이모지 아이콘은
notion-to-md 마크다운에 텍스트로 노출돼 `> |` 파서 패턴을 깨뜨린다.

## ADR-033: 페이지별 OG 카드 — Node 런타임 + 커밋형 Pretendard 폰트

**배경**: OG 이미지가 루트 1장(Edge 런타임, 폰트 미주입, "yoonsoo.dev" 하드코딩)이었고,
운영 `NEXT_PUBLIC_SITE_URL`이 죽은 도메인(portfolio.kirico.xyz)이라 og:image 절대 URL을
크롤러가 가져올 수 없었다. favicon 자산도 전무(`/favicon.ico` 404).

**결정**:
- OG 카드를 공용 빌더(`lib/og-card.tsx`) + 라우트별 `opengraph-image.tsx`(/, /chat, /about,
  /experience, /contact)로 재구성. 프로필 사진(원형) + 페이지별 타이틀 + Pretendard.
- **런타임 Edge → Node**: 한글 폰트 woff(~1.1MB×2)가 Edge 번들 1MB 한도를 초과 (ADR-031과
  동일한 결). `dynamic = "force-static"`으로 빌드 타임 생성해 콜드스타트 영향 없음.
- **폰트 자산 커밋**: `assets/fonts/Pretendard-{SemiBold,Regular}.woff` (satori는 woff2
  미지원 → woff, SIL OFL·LICENSE 동봉). 서버 전용 디렉터리라 클라이언트 번들 미포함.
- favicon 은 코드 생성(`app/icon.tsx` 32 · `app/apple-icon.tsx` 180, 모노그램 K + 라임 점)
  + 정적 `app/favicon.ico`(png-to-ico 변환 커밋). layout 의 수동 `icons` 필드 제거 —
  파일 규약 자동 주입.
- 도메인: Vercel `NEXT_PUBLIC_SITE_URL` = `https://yoonsoo.kirico.xyz` 로 교체 (기존 값은
  DNS 미해석 도메인).

**트레이드오프**: 폰트 커밋으로 repo +~2.2MB. 동적 텍스트(노션 헤드라인 연동)는 보류 —
타이틀이 라우트 고정 문자열이라 빌드 타임 정적 생성이 더 단순·안정적.

## ADR-034: RAG 스택 AWS 전환 총괄 — Bedrock + S3 Vectors + Lambda 인제스천

**상태**: 승인 (Phase 0 진행 중). ADR-004 의 출구 전략(pgvector)을 대체하며, 완료 시
ADR-026(챗 부분)·ADR-029(캐시 저장 위치)·ADR-030(커밋형 데이터) 을 단계적으로 대체한다.
ADR-031(Node 런타임)은 유지 — 사유가 "번들 한도" 에서 "AWS SDK + corpus 메모리 캐시" 로 갱신.

**배경**: 현행 RAG 는 (1) 빌드 타임에 Voyage/OpenAI 로 임베딩 후 `data/portfolio.server.json`
(3.3MB) 을 git 커밋, (2) 런타임은 쿼리 임베딩을 계산하지 않아 **실서비스 검색이 keyword-only**
(벡터는 MOCK_LLM 테스트에서만 사용), (3) 커밋된 벡터(512차원)와 코드 경로(1024/1536차원)
불일치, (4) 노션 수정 → 로컬 sync → 커밋 → 푸시(재배포)의 수동 5단계 반영. 소유자는 AWS
활용 역량 축적과 콘텐츠 자동 반영을 원하며, 비용 최소화를 최우선 제약으로 명시했다.

**결정**:
1. **임베딩**: Bedrock Titan Text Embeddings v2 (1024차원, `amazon.titan-embed-text-v2:0`).
   캐시 네임스페이스 `amazon.titan-embed-text-v2:0@1024` — ADR-029 메커니즘으로 전량 자동
   무효화(재임베딩 ~$0.003), 512차원 불일치 해소.
2. **벡터 스토어**: S3 Vectors (2025-12 GA, 서울 리전 지원 확인). 벡터 key = 기존 결정적
   chunk.id, filterable metadata `{category, sourcePageId}` 만 저장. 청킹 로직(`lib/chunking.ts`)
   과 chunk ID 체계는 불변. Knowledge Bases 미사용(커스텀 제어·테스트 호환 우선).
3. **청크 텍스트**: 표준 S3 의 `corpus.json`(임베딩 제외, ~1.5MB) 단일 소스. 런타임은 TTL
   10분 메모리 캐시. keyword 검색은 corpus 대상 기존 retriever 로직 그대로 — S3 Vectors 결과
   (chunkId+score)와 병합해 **프로덕션 최초의 실질 하이브리드 검색**을 점등.
4. **챗 LLM**: OpenRouter → Bedrock Converse (`@ai-sdk/amazon-bedrock`). 기본 모델
   **Nova Lite**($0.06/$0.24 per 1M tok, 비용 최소화), 옵션 Nova Micro·Claude Haiku.
   `or.chat()` 제약(ADR-026)은 소멸.
5. **인제스천 자동화**: EventBridge Scheduler `rate(24 hours)` → Sync Lambda (freshness
   선체크 → stale 시 fetch→청킹→임베딩→S3 Vectors 업서트 + corpus.json 갱신). 노션 수정이
   재배포 없이 최대 24h+10min 내 자동 반영. 수동 invoke 로 즉시 반영 가능.
6. **인증**: Vercel OIDC federation → IAM Role (AssumeRoleWithWebIdentity). 장기 액세스 키
   미발급. 리전 ap-northeast-2(서울) + Vercel `icn1`.
7. **IaC**: `infra/` 에 CDK(TypeScript) 독립 워크스페이스. Terraform 등가 매핑을 학습 노트로
   병기.
8. **폴백 계약 유지**: Bedrock/S3 Vectors 장애·타임아웃 → keyword-only (ERR-14,
   `X-Retrieval-Mode`), corpus 장애 → 커밋된 `data/portfolio.fallback.json`(슬림), 빈 검색 →
   NO_RECORD 정적 응답(ERR-08), 모델 장애 → `X-Model-Substitution`. MOCK_LLM=1 은 AWS 호출
   0회(CI/E2E 결정성 유지, sample 픽스처 지속).

**단계**: Phase 0 ADR/spec/infra 부트스트랩(FEAT-035~039 planned 등록) → 1 챗 Bedrock 전환
(FEAT-035) → 2 Titan 임베딩(FEAT-036) → 3 S3 Vectors + 하이브리드 점등(FEAT-037, env 제거 =
keyword-only kill switch) → 4 Lambda 자동 수집(FEAT-038) → 5 키·대형 커밋 데이터 제거(FEAT-039).

**비용**: 고정비 ~$0 (Lambda/Scheduler/SSM/CloudWatch 프리티어 내, S3 Vectors 저장 ~1.5MB),
변동비는 챗 LLM 뿐 — Nova Lite 기본 시 월 ~$0.5, 일 토큰캡(`MAX_TOKENS_PER_DAY`) 풀소진
가정 상한 ~$2. 비용 알림은 CloudWatch billing alarm($5, 프리티어 무료 — AWS Budgets 미사용).

**트레이드오프**: ADR-030 의 "빌드 = API 0회" 결정성을 콘텐츠 자동 반영과 맞바꾼다(단 폴백
JSON + MOCK 게이트로 CI 결정성은 유지). 검색 경로에 AWS 왕복 2회(임베딩+쿼리)가 추가되나
동일 리전 배치 + 800ms 타임아웃 강등으로 상쇄. S3 Vectors 는 GA 초기 서비스로 CDK L1 미지원
가능성(→ AwsCustomResource 대비), `VectorStore` 인터페이스 추상화로 pgvector 출구 전략 보존.

## ADR-035: 챗 LLM OpenRouter → Bedrock Converse 전환 (ADR-034 Phase 1, ADR-026 챗 부분 대체)

**배경**: ADR-026 의 OpenRouter 단일 키 라우팅을 ADR-034 결정 4 에 따라 Bedrock 으로 교체.
검색 경로는 일절 건드리지 않는 최소 런타임 변경으로, AWS 자격 증명 경로(OIDC)를 먼저
실전 검증하는 것이 목적.

**결정**:
1. `lib/models.ts` 레지스트리 교체: `nova-lite`(**기본**, $0.06/$0.24 per 1M tok) /
   `nova-micro`($0.035/$0.14) / `claude-haiku`(품질 옵션). 파라미터(1024/0.3/0.9) 유지.
   Bedrock 모델 ID 는 APAC 교차 리전 inference profile (`apac.amazon.nova-lite-v1:0` 등) —
   서울 리전 단독 미보유 모델 대비. 정확한 가용성은 `npm run test:smoke` 로 검증.
2. 구 OpenRouter ID(gpt-4o-mini/claude-3-5-haiku/gemini-2.0-flash 및 -latest/-exp)는
   `LEGACY_ID_MAP` 으로 무보정 흡수 — localStorage 저장분이 `X-Model-Substitution` 없이
   새 모델로 매핑된다. gpt/gemini → nova-lite, claude → claude-haiku.
3. 자격 증명: `services/aws-credentials.ts` — Vercel 은 `VERCEL_OIDC_TOKEN` +
   `PORTFOLIO_AWS_ROLE_ARN` 으로 `@vercel/functions` OIDC provider, 로컬은
   `PORTFOLIO_AWS_PROFILE` 로 Node provider chain. lazy import 로 MOCK 경로에서
   AWS 모듈 로드 0회. 가용성 판정(`listAvailableModels`)은 두 env 중 하나 존재 기준.
4. `@ai-sdk/amazon-bedrock` 은 **^4.x 고정** — 5.x 는 provider spec v4 로 리포의
   `ai@6`(LanguageModelV3)과 비호환. `or.chat()` 제약(ADR-026)은 소멸.
5. spec.json `models[]` 를 Bedrock 3종으로 교체(provider enum 에 `amazon` 추가),
   MOCK_LLM mock 모델·`X-Model-Substitution`·`no_models_available` 503 계약 불변.

**트레이드오프**: OpenRouter 의 멀티 프로바이더(GPT/Gemini) 선택권이 사라지고 Bedrock
보유 모델로 한정된다(비용 최소화 우선). OPENROUTER_API_KEY env 는 Phase 5 까지 유지 —
이 PR revert 만으로 즉시 복귀 가능. 머지 전 실 API 수동 검증(test:smoke) 필수 —
AWS 자격 증명 + Bedrock model access 활성화가 전제.

## ADR-036: 하네스 2세대 — 커스텀 실행기 폐지, 네이티브 루프 + 생성자·평가자 분리

> ADR-035 는 feat/aws-bedrock-chat (PR #49, Bedrock 챗 전환) 이 사용 — 번호 충돌 회피를 위해 036.

**배경 (1세대 부검)**: `scripts/execute.py`(856줄, 테스트 136개) 기반 1세대 하네스는 실질
사망했다. 물증: `phases/8-chat-layout-revamp` step0 은 3회 시도 전부 0초 실패(exit 1,
$0)인데 최종 completed 로 수동 기입 — 루프 붕괴 후 사람이 손으로 복구했고, index.json 만으로는
성공과 구분 불가. 구조적 원인 두 가지: ① **검증이 자기신고** — Claude 가 쓴 status 를
실행기가 믿고 커밋 ② 외부 오케스트레이터의 유지비가 우회 유인을 만듦(이후 PR 대부분이
하네스 미경유). 동일 소유자의 bbang2bbang 프로젝트가 이 부검 위에 2세대 설계(네이티브
프리미티브 + 평가자 분리)를 검증 중이며, 이를 본 리포 성격에 맞게 이식한다.

**결정**:
1. **커스텀 실행기 폐지** — execute.py·test_execute.py·harness 명령 3종·관련 agent 스펙
   삭제(git 이력 보존). 기존 `phases/{task}/` 완료 기록은 보존.
2. **루프 = `/loop` 슬래시 커맨드** — `phases/stories.json`(큐)에서 `passes:false` 첫
   스토리 1개만 Plan→Execute(TDD)→Verify(AC 직접 실행)→Commit→Review 로 완주 후 정지.
   무인 연속 실행 없음.
3. **생성자–평가자 분리** — `.claude/agents/reviewer.md` 독립 서브에이전트가 AC 재실행·
   diff 치팅 스캔·SSoT 동기화 검증 후 `passes` 를 갱신하는 **유일한 주체**
   (`REVIEWER_OK=1` Bash 전용, Edit/Write 는 훅 차단). 반려 3회 → 사람 에스컬레이션.
4. **완료 조건 = SSoT 동기화** — bbang2bbang 의 "학습 노트" 를 본 프로젝트 성격(학습
   목적 아님, 채용용 산출물+운영 서비스)에 맞게 치환: spec.json FEAT/TS·ADR·docs·env
   갱신 누락은 reviewer 반려 사유. 기존 CRITICAL 문서 규칙을 게이트로 승격.
5. **훅 계층 강화** — 신규 `post-edit-check.sh`(PostToolUse: 편집 파일 즉시 prettier+
   eslint, exit 2) + `reviewer-gate.sh`(PreToolUse: stories.json 쓰기 권한 분리 + 훅·
   settings·lint 설정 자기수정 차단). `post-session-check.sh`(Stop)에 치팅 스캔
   (.only/.skip 추가, 테스트 파일 삭제)과 stop_hook_active 재진입 가드 추가.
   훅 5종 전부 `scripts/test_settings.py` 계약 테스트로 고정 (103 테스트).
6. **AC 는 실행 가능 커맨드만** — screenshot 등 자기신고형 AC 타입 금지 (bbang2bbang 의
   확인된 약점 원천 차단). UI 검증은 Playwright E2E(MOCK_LLM=1) 커맨드로.

**의도적으로 도입하지 않은 것**:
- 커스텀 실행기 재작성 — 1세대 부검이 근거. 유지비와 우회 유인만 남긴다.
- 무인 연속 실행(큐 소진까지 자동) — 실 LLM API·AWS 배포·프로덕션이 걸려 있어 스토리
  경계마다 사람 확인 가치가 큼. 신뢰 축적 후 재검토.
- 학습 노트 완료 조건 — 프로젝트 성격 불일치 (SSoT 동기화로 치환).
- 락·비용 상한·exit code 체계 — 무인 실행이 사라지면 보호 대상도 사라짐.

**실증**: 도입 당일 reviewer-gate 가 작성자 자신의 훅 수정 Write 와, 테스트 코드 안의
공격 문자열이 포함된 Bash heredoc 을 각각 차단 — 자기보호와 오탐 방향(안전측)이 실동작으로
확인됨. 한계도 자백: 문자열 휴리스틱이라 cp/변수 조립 등으로 우회 가능 — 최종 신뢰 경계는
reviewer 재실행 + 사람 PR 리뷰다.

**트레이드오프**: 1세대의 무인 다단계 자동화(밤새 N step)를 포기하고 스토리 단위 사람
게이트를 얻는다. 훅 오탐(히어독 내 문자열 등)은 안전한 방향의 마찰로 수용. spec 테스트
경로 drift 16건이 발견되어 `--strict-tests` 활성화는 S1 스토리로 이관.

## ADR-037: Lambda 자동 인제스천 + 런타임 corpus S3 로딩 (AWS Phase 4)

- 날짜: 2026-08-05 (KST)
- 상태: 승인
- 관련: ADR-034(총괄), ADR-030(조건부 sync), FEAT-038, TS-92

**맥락**: Phase 3까지 검색·임베딩·챗은 AWS로 전환됐지만 인제스천은 여전히 수동
5단계(로컬 sync → 데이터 커밋 → 푸시 → 배포)였다. 노션 수정이 서비스에 반영되려면
사람 손이 필요했다 — AWS 전환의 원 목표 결함 중 하나.

**결정**:
1. **sync 코어 분해** — `lib/sync/core.ts` (ref 수집→fetch→청킹→빌드, fs/프로세스
   의존 없음). `scripts/sync-notion.ts`(로컬)와 `lambda/ingest/handler.ts`(자동)가 공유.
2. **corpus.json 표준 S3 이전** — 임베딩 제거한 청크+프로필+추천질문(~1.5MB)을
   `portfolio-corpus-{account}`에 업로드. 벡터는 S3 Vectors 가 단일 소스이므로 런타임에
   청크 임베딩이 불필요 (vectorScores 주입 경로, ADR-034 결정 3).
3. **런타임 corpus 로더** — `services/corpus-loader.ts`, 10분 TTL 메모리 캐시.
   미설정(CORPUS_S3_BUCKET 없음)·장애·형식 불량은 전부 커밋된 portfolio.server.json
   폴백 + console.warn (ERR 계약: 응답은 계속된다). 장애 응답도 TTL 캐시해 매 요청
   S3 재시도를 방지.
4. **IngestStack** — EventBridge Rule rate(24h) → NodejsFunction(portfolio-ingest-sync,
   Node 22, 1GB, 10min). freshness 선체크(저렴한 ref 조회 vs corpus generatedAt)로
   변경 없으면 즉시 종료. stale 시 fetch→청킹→Titan 전량 임베딩(캐시 없음 —
   stale 시에만 실행, 287청크 ~$0.002)→S3 Vectors 업서트+고아 삭제→corpus.json 갱신.
   NOTION_TOKEN 은 SSM SecureString `/portfolio/notion-token` (CFN 미지원이라 CLI 생성).
   실패 알람: Lambda Errors ≥1 → 서울 SNS 토픽(빌링 토픽은 us-east-1 이라 별도).
5. **번들링** — esbuild alias 로 `server-only`(Next 전용 가드, 일반 Node 에서 throw)를
   빈 스텁으로 치환. spec.json 은 번들에 포함(추천질문은 배포 시점 고정 — 어차피
   spec 변경은 배포 동반).

**결과**: 노션 수정 → 최대 24h(스케줄) + 10min(런타임 TTL) 내 자동 반영, 재배포 불필요.
수동 즉시 반영: `aws lambda invoke --function-name portfolio-ingest-sync`.
커밋된 portfolio.server.json 은 폴백+로컬 dev 용으로 유지 (슬림화는 FEAT-039/S5).
MOCK/CI 경로 불변 — CORPUS_S3_BUCKET 미설정이면 기존과 동일.

**트레이드오프**: corpus 이중 소스(S3 최신 vs 커밋 폴백)가 일시적으로 공존 — 폴백은
최대 "마지막 커밋 시점" 콘텐츠로 서빙될 수 있음을 수용(장애 시나리오 한정). 클라이언트
추천질문(public/data/suggestions.json)은 여전히 빌드 산출물이라 노션 자동 반영 대상이
아님 — 추천질문 소스는 spec.json 이므로 실질 영향 없음.

## ADR-038: 커밋 데이터 슬림화 — portfolio.fallback.json (ADR-030 개정)

- 날짜: 2026-08-06 (KST)
- 상태: 승인
- 관련: ADR-030(조건부 sync), ADR-037(런타임 corpus), FEAT-040, TS-93

**맥락**: ADR-030 은 재현 가능한 빌드를 위해 임베딩 포함 전체 데이터(9.2MB)와 임베딩
캐시(6.2MB)를 커밋했다. ADR-037 이후 운영 소스는 S3 corpus + S3 Vectors 가 됐고,
커밋 데이터의 역할은 "장애 폴백 + 로컬 dev + prebuild(gen:suggestions) 입력"으로
축소됐다 — 세 역할 모두 임베딩이 필요 없다(벡터 점수는 S3 Vectors 가 공급).

**결정**:
1. 커밋 대상을 `data/portfolio.fallback.json`(임베딩 제외, ~370KB)으로 교체.
   `portfolio.server.json`·`embeddings-cache.json` 은 gitignore(로컬 sync 산출물).
2. 로더(`lib/portfolio-data.ts`) 우선순위: server.json(로컬 산출물·CI fixture)
   → fallback.json(커밋본) → sample.json(CI 안전망). 임베딩 없는 청크는 embedding=[].
3. `sync:notion` 은 server.json 과 함께 fallback.json 을 항상 산출 — 노션 반영
   커밋 플로우는 "fallback.json 커밋"으로 단순화. prebuild 게이트·sync:check 는
   server||fallback 의 generatedAt 을 읽는다.
4. CI 는 기존대로 sample→server.json 복사(결정적 fixture), E2E global-setup 불변.

**결과**: 리포에서 ~15MB 제거, 노션 콘텐츠 변경 커밋이 370KB diff 로 축소.
로컬 dev(MOCK)에서 server.json 이 없으면 검색은 keyword-only 로 동작(질의 fixture
임베딩과 병합할 청크 임베딩이 없음) — dev 실검증은 어차피 실 AWS 경로로 수행하므로 수용.

**트레이드오프**: "git 이력에 어떤 임베딩이 배포됐는지" 추적은 포기 — 임베딩은 이제
S3 Vectors 런타임 상태이며 캐시 네임스페이스(ADR-029)가 정합성을 보장한다.

## ADR-039: 웹 표준·접근성 CI 강제 — jsx-a11y + axe E2E + Lighthouse gate 3계층

**배경**: FEAT-013(접근성)이 planned 로만 존재 — `.lighthouserc.json` 은 있으나
lhci.yml 이 `if: false`, axe 테스트는 docs 에만 언급되고 미구현. 접근성은 사람의
기억이 아니라 CI 가 강제해야 퇴행이 막힌다.

**결정**: 검사 시점이 다른 3계층을 겹쳐 강제.
1. **정적 lint** — `eslint-plugin-jsx-a11y` recommended(error)를 `eslint.config.mjs` 에
   추가 (next 기본 6개 warn 에서 승격). PR lint 단계에서 즉시 차단.
2. **런타임 DOM 검사** — `tests/e2e/a11y.e2e.ts`: `@axe-core/playwright` 로 주요
   5페이지를 WCAG 2.0/2.1 A+AA 태그 스캔(위반 0건, TS-62) + 스킵 링크 키보드
   시나리오(TS-61). CI 는 `a11y` 경량 job(chromium 1개) — 전체 e2e job(post-mvp
   보류)과 독립.
3. **점수 gate** — lhci.yml 활성화(`@lhci/cli` devDep 고정). 기존
   `.lighthouserc.json` gate(perf 0.90 / a11y 0.95 / bp 0.95 / seo 0.95)에
   `startServerCommand` 를 보완해 실제 실행 가능하게 함. PR 마다 4페이지 측정.

**대안 기각**: pa11y(axe CLI 래퍼 — Playwright 보유 시 중복), html-validate(W3C
문서 유효성 — axe+Lighthouse best-practices 가 실질 위반 대부분을 커버, 도구 1개 절약).

**적용 수반 수정**: 스킵 링크 신설(LayoutClient), 헤더 `<nav aria-label="주 메뉴">`,
전 라우트 `<main id="main-content">`, `text-faint` 텍스트 사용 6곳을 `text-subtle` 로
교체(faint 는 대비 AA 미달 — 장식 전용으로 강등, UI_GUIDE 반영), Composer 의 미사용
`autoFocus` prop 제거(jsx-a11y/no-autofocus).

**한계**: 자동 도구는 접근성 문제의 30~50%만 감지 — 포커스 순서·alt 품질 등은
수동(키보드·VoiceOver) 검증 병행이 전제.
