# Architecture Decision Records

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
