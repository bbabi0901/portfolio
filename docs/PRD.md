# PRD: AI Portfolio (김윤수 대화형 포트폴리오)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, CLAUDE.md, spec.json, ARCHITECTURE.md, ADR.md, PAGES.md
**SSoT keys**: spec.service, spec.features (제품 비전)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

## 목표
방문자가 채팅 한 번으로 김윤수의 커리어·프로젝트·기술을 노션 기록 기반으로 정확하게 이해할 수 있는 사이트.

## 배경 / 문제
- 정적 포트폴리오는 메뉴 탐색 부담이 있고, 깊은 기록은 잘 노출되지 않는다.
- 노션에 25+개의 깊이 있는 프로젝트 기록(MFE TF, Turbopack 도입, 밈코인 플랫폼 DM/PWA, weju 등)이 잠자고 있다.
- 답변이 부족하면 소유자(김윤수)가 노션을 보강해 자동 반영되어야 한다.
- 인프라/운영 비용은 0에 가까워야 한다.

## 사용자 (페르소나)
- **P1 채용 담당자**: 30초 안에 핵심을 파악하고, 깊은 질문 1–3개로 적합성을 검증.
- **P2 동료 개발자**: 기술 디테일(아키텍처, 트러블슈팅) 비교/검증.
- **P3 클라이언트/협업 후보**: 직무 범위, 진행 가능 영역 확인 후 Contact 폼으로 연락.
- **P4 소유자(김윤수)**: 답변 품질 모니터링 + 부족한 답변 보강 + 콘텐츠 관리.

## 핵심 기능 (FEAT-001 ~ FEAT-029) 요약

| ID | 기능 | 우선순위 |
|---|---|---|
| FEAT-001 | 멀티 모델 채팅 (GPT/Claude/Gemini) | P0 |
| FEAT-002 | SSE 스트리밍 + Typing Indicator (`...`) | P0 |
| FEAT-003 | 추천 질문 Carousel (badge) | P0 |
| FEAT-004 | 메시지 피드백 (👍/👎 → Notion DB) | P0 |
| FEAT-005 | 노션 빌드시 동기화 | P0 |
| FEAT-006 | RAG 하이브리드 검색 (키워드+벡터) | P0 |
| FEAT-007 | 시스템 프롬프트 / 인젝션 방어 / 출력 통제 | P0 |
| FEAT-008 | Rate Limit + 일별 토큰 상한 | P0 |
| FEAT-009 | 동적 추천 질문 생성 (휴리스틱) | P1 |
| FEAT-010 | spec.json (SDD) | P0 |
| FEAT-011 | TDD 테스트 인프라 | P0 |
| FEAT-012 | 모니터링/관측 | P1 |
| FEAT-013 | 접근성 / i18n 기본 | P0 |
| FEAT-014 | 첫 인사 (Simulated Greeting) | P0 |
| FEAT-015 | Sticky-to-bottom Scroll + Jump-to-latest | P0 |
| FEAT-016 | 메시지 액션 (Copy / Regenerate / Other-model / 출처) | P1 |
| FEAT-017 | 새 대화 (Clear) + 단축키 | P1 |
| FEAT-018 | 폰트 / 안전영역 / 메타 | P0 |
| FEAT-019 | SEO / OG / sitemap / robots / JSON-LD | P0 |
| FEAT-020 | 푸터 / 마지막 업데이트 / 프라이버시 노트 | P0 |
| FEAT-021 | IME / Composer 디테일 | P0 |
| FEAT-022 | 응답 끝 관련 질문 칩 | P2 |
| FEAT-023 | 햄버거 사이드 메뉴 (Sheet) | P0 |
| FEAT-024 | 자기소개 페이지 (`/about`) | P0 |
| FEAT-025 | 기술 이력 페이지 (`/experience`) | P0 |
| FEAT-026 | 연락하기 페이지 + 폼 (`/contact`) | P0 |
| FEAT-027 | 봇 보호 (honeypot + rate limit) | P0 |
| FEAT-028 | 반응형 디자인 시스템 | P0 |
| FEAT-029 | 라우팅 / 페이지 전환 UX | P0 |

각 기능의 AC, Edge Cases, Error Cases는 spec.json `features[]`에 정의된다 (단일 진실 소스).

## MVP 제외 사항 (의도적)
- 다국어 i18n 토글 (자동 감지만)
- 라이트 모드 토글
- 사용자 인증/계정
- 대화 영속화/공유 링크
- 이미지 첨부 입력 (LLM 비전)
- 음성 입력/출력 (TTS/STT)
- AI에게 코드 생성 요청 ("이 코드 짜줘") — 본 사이트는 포트폴리오 Q&A 한정
- 푸시 알림
- 통계 대시보드 (관리자용)

## 디자인 방향
- 다크 모드 고정. 페이지 #0a0a0a, 카드 #141414.
- 무채색 + 포인트 1색(lime-300, 절제 사용).
- 도구처럼 보일 것. 마케팅 페이지 안티패턴 금지.
- 자세한 토큰/클래스: docs/UI_GUIDE.md.

## 사용자 시나리오 (USR-01 ~ USR-08)
- **USR-01** P1 채용자가 carousel "최근 1년에 한 일" 클릭 → 30초 만에 핵심 파악.
- **USR-02** P2 개발자가 자연어로 "MFE 어떻게 하셨어요?" 질문 → 출처 인용된 답변 + 노션 페이지 새 탭 열기.
- **USR-03** P3 클라이언트가 햄버거 → "기술 이력" → 회사/프로젝트 확인 → 햄버거 → "연락하기" → 폼 작성/제출.
- **USR-04** P4 소유자가 노션 "Q&A 피드백" DB에서 Status="새" 항목 확인 → 노션 페이지 보강 → 빌드 → 자동 반영.
- **USR-05** 모바일 사용자가 carousel 좌우 스와이프 → 즉시 전송 → SSE typing indicator → 응답 도착.
- **USR-06** 키보드 사용자가 Tab만으로 헤더 → 햄버거 → 메뉴 진입 → 폼 작성 → 제출.
- **USR-07** 다른 모델로 같은 질문 → 응답 비교 (Regenerate "다른 모델로" 액션).
- **USR-08** 답변 부족 시 👎 → reason 선택 → Notion DB 자동 row → 토스트 안내.

## 성공 지표 (수치)
- 첫 토큰 TTFB: p50 < 1.5s, p95 < 3.5s
- 회당 LLM 비용: 평균 < $0.001 (RAG로 토큰 절감)
- 일별 LLM 비용 cap: $1 (`MAX_TOKENS_PER_DAY=200000` 기준)
- 인젝션 5종 100% 거부 (TS-05)
- Lighthouse: Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO ≥ 95
- 모바일 vs 데스크톱 6종 디바이스 매트릭스 시각 회귀 0건
- 색 대비 WCAG AA 위반 0건
- Notion sync 실패 시 사이트 가동 유지 (마지막 성공 산출물 보존)

## 비기능 요구사항
- **보안**: 모든 API 키 서버 only. 클라이언트 번들에 임베딩/시스템 프롬프트 누출 0.
- **개인정보**: Contact 폼 외 사용자 PII 수집 안 함. 채팅 메시지는 익명, 학습 데이터로 미사용.
- **저작권**: 노션 콘텐츠는 본인 작성물 only.
- **가용성**: 서버리스 무상태. 단일 인스턴스 다운 영향 0.
- **국가/지역**: KST 기준. 한국어 우선, 영어 응답 자동 감지.

## 콘텐츠 인벤토리 (현재 노션 기준)
- 김윤수 이력서 (전체 페이지)
- 프로젝트 DB: 자체프로젝트(weju), 업무(MFE TF, 밈코인 플랫폼 + 어드민, 텔레그램 미니앱, 토큰 런치패드, 인터체인 NFT 등 10+ 페이지), 외부활동.
- 트러블슈팅/패턴 서브페이지: useConfirm, WebView, modal viewport, MFE 충돌, DM UX 디테일, PWA 적용 등.
- 추가 예정: 자기소개 보강, 성격/MBTI, 취미, 가치관.
- 추가 예정 (DB): Q&A 피드백, Contact.

## 의존성 / 외부 서비스
- Notion API (필수)
- OpenAI API (필수: 임베딩 + 채팅)
- Anthropic API (선택: 모델 옵션)
- Google Generative AI API (선택: 모델 옵션)
- Vercel (호스팅, Edge runtime)
- Resend (선택: Contact 알림 이메일)
- Cloudflare Turnstile (선택, P2)
- Upstash Redis (선택: rate limit 영속화)

## 출시 계획 (Phase)
- **Phase 0** (현재): 문서 보강 (이 문서 + 15개 docs/spec.json)
- **Phase 1**: 스캐폴딩 (Next.js 16 + shadcn + Hono + 환경변수 + spec 검증)
- **Phase 2**: 콘텐츠 파이프라인 (sync-notion, generate-suggestions, retriever) — TDD
- **Phase 3**: 채팅 백엔드 (/api/chat, prompts, models, injection-defense) — TDD
- **Phase 4**: 채팅 UI + 첫 인사 + Carousel + 메시지 액션 — TDD
- **Phase 5**: 사이드 메뉴 + 4개 페이지 (about/experience/contact) + 폼 + 봇 보호
- **Phase 6**: 운영 가드 + Lighthouse 튜닝 + 시각 회귀
- **Phase 7**: 배포 + README/CONTENT_GUIDE 사용자 안내

## 오픈 이슈 (Phase 1 진입 전 확정)
- 노션 Q&A 피드백·Contact DB 최종 위치 → ✅ 확정. `기록 / 프로젝트 / 대화형 포트폴리오` row 하위. 상세는 [`NOTION_STRUCTURE.md`](./NOTION_STRUCTURE.md).
- LinkedIn URL 등 외부 프로필.
- 도메인 (yoonsoo.dev / portfolio.yoonsoo.dev).
- 첫 인사 텍스트 최종 문구.
- Resend 도입 여부, Cloudflare Turnstile 도입 여부.
