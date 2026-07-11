# Test Scenarios (사용자 플로우 기반)

<!-- agents-md-meta -->
**Owner agent**: qa-runner (Virtual → 현재 harness) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, CLAUDE.md, TESTING.md, PAGES.md, spec.json
**SSoT keys**: spec.testScenarios (TS-XX 매핑)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

각 시나리오는 `TS-XX`로 식별되며 `spec.json testScenarios[]`에 등록된다. 시나리오는 Given/When/Then 구조 + 매핑 파일로 관리.

## 페르소나
- **P1** 채용 담당자 — 30초 안에 핵심 파악
- **P2** 동료 개발자 — 기술 디테일 검증
- **P3** 클라이언트/협업 후보 — 직무 범위 확인 후 연락
- **P4** 소유자(김윤수) — 답변 모니터링 + 콘텐츠 보강
- **B** 봇 — Contact 폼 자동 제출 시도
- **A** 키보드 only / 보조 기술 사용자

---

## 채팅 (대화) 페이지

### TS-01 첫 진입 인사 시뮬레이션
- **Given**: 사용자가 처음 사이트에 진입 (greeted 플래그 없음)
- **When**: 페이지가 paint 되고 400ms 경과
- **Then**:
  1. 어시스턴트 메시지 placeholder 등장, TypingDots만 표시
  2. 600ms 후 인사 텍스트가 단어 단위로 30–50ms 간격으로 누적
  3. 출력 완료 시 TypingDots 사라짐, 입력창 자동 focus, carousel 1회 pulse
  4. 새로고침 1회 → 시뮬레이션 생략 + 정적 표시
- **파일**: `tests/e2e/chat.e2e.ts:firstGreeting`, `specs/greeting-player.spec.tsx`

### TS-01b Multi-turn 연속 대화 (빈 응답·400 에러 없음)
- **Given**: 인사 완료 후, 첫 번째 질문에 응답이 왔음
- **When**: 사용자가 두 번째, 세 번째 질문을 이어서 보냄
- **Then**:
  1. 각 질문마다 응답 버블이 비어있지 않음 (text > 0)
  2. 400 "요청 형식이 올바르지 않아요" 에러 발생 없음
  3. assistant message history가 다음 요청에 정상 포함됨
- **Coverage levels**:
  - E2E: `tests/e2e/chat.e2e.ts:TS-01-multi-turn`
  - Integration: `specs/chat-route.spec.ts:multi-turn`
  - Unit: `specs/components/chat-root.spec.tsx:prepareSendMessagesRequest`

### TS-02 Reduced motion 첫 인사
- **Given**: prefers-reduced-motion=reduce
- **When**: 페이지 진입
- **Then**: 시뮬레이션 0, 인사 텍스트 즉시 표시, focus는 입력창
- **파일**: `tests/e2e/chat.e2e.ts:firstGreetingReducedMotion`

### TS-03 추천 질문 클릭 → 응답
- **Given**: 인사 완료 후
- **When**: P1이 "최근 1년에 한 일이 뭐예요?" 칩 클릭
- **Then**:
  1. 즉시 사용자 메시지 등장
  2. typing dots 표시
  3. 첫 토큰 도착 → 본문 누적
  4. 응답 끝, 출처 chip 1개 이상 노출
  5. 칩이 visited 상태로 흐려짐
- **파일**: `tests/e2e/chat.e2e.ts:suggestedClick`

### TS-04 모델 스위칭
- **Given**: 채팅 진행 가능 상태
- **When**: ModelSwitcher에서 GPT→Claude→Gemini 순서 변경하면서 같은 질문 보냄
- **Then**:
  1. 매 변경마다 응답이 정상 도착
  2. localStorage `portfolio.model` 갱신
  3. toast "이제 {모델명}으로 답변할게요" 표시
- **파일**: `specs/models.spec.ts`, `tests/e2e/chat.e2e.ts:modelSwitch`

### TS-05 인젝션 5종 거부
- **Given**: 시스템 프롬프트 v1.0
- **When**: INJ-01~05 (docs/AI_CONTRACT.md) 입력 차례로 전송
- **Then**: 모두 시스템 프롬프트 키워드 미포함 + 거부 문구 포함 + sourceUrl만 인용
- **파일**: `specs/injection-defense.spec.ts`

### TS-06 컨텍스트 외 질문
- **Given**: 정상 시스템
- **When**: "토트넘 어떻게 생각하세요?" 입력
- **Then**: LLM 호출 없이 즉시 "그 부분은 기록되어 있지 않습니다" 응답 (retriever 점수 < 0.3)
- **파일**: `specs/retriever.spec.ts`, `specs/chat-route.spec.ts`

### TS-07 영어 질문
- **Given**: 한국어 컨텍스트
- **When**: "Tell me about your MFE migration"
- **Then**: 영어 응답 + 한국어 노션 페이지 출처 링크
- **파일**: `specs/chat-route.spec.ts`

### TS-08 Stick-to-bottom 정책
- **Given**: 메시지 5개 보이는 상태
- **When**: 사용자가 위로 200px 스크롤 → 새 응답 도착
- **Then**: 자동 스크롤 X, "↓ 최신으로" 버튼 등장. 클릭 시 smooth scroll bottom
- **파일**: `specs/message-list.spec.tsx` (or `chat-root`), `tests/e2e/chat.e2e.ts:stickToBottom`

### TS-09 응답 도중 새 질문
- **Given**: in-flight streaming
- **When**: 사용자가 추가 메시지 전송
- **Then**: AbortController로 기존 abort, 새 요청 시작, UI는 새 응답 표시
- **파일**: `specs/chat-route.spec.ts:abortInFlight`

### TS-10 Regenerate / 다른 모델로 다시
- **Given**: 어시스턴트 메시지 도착
- **When**: MessageActionsBar에서 Regenerate / Try-other-model
- **Then**: 같은 사용자 메시지로 새 응답이 직전 어시스턴트 메시지를 교체. Try-other은 임시 모델로 호출(헤더 모델 변경 X)
- **파일**: `specs/message-actions.spec.tsx`

### TS-11 메시지 Copy
- **Given**: 어시스턴트 메시지 hover
- **When**: Copy 클릭
- **Then**: clipboard에 텍스트 + 0.8s "복사됨" 표시
- **Edge**: 권한 거부 → execCommand fallback → 토스트
- **파일**: `specs/message-actions.spec.tsx:copy`

### TS-12 새 대화 (Clear) + Cmd+K
- **Given**: 메시지 다수 + in-flight
- **When**: ClearConversationButton 클릭 또는 Cmd/Ctrl+K
- **Then**: confirm 후 메시지 초기화, in-flight abort
- **파일**: `specs/clear-conversation.spec.tsx`

### TS-13 IME composing 중 Enter
- **Given**: 한국어 IME 조합 중
- **When**: Enter 누름
- **Then**: 전송 안 됨. 조합 종료 후 Enter → 전송
- **파일**: `specs/composer.spec.tsx`

### TS-14 메시지 길이 검증
- **Given**: Composer
- **When**: 빈 입력 / 500자 초과 붙여넣기
- **Then**: 빈 → 전송 disabled. 초과 → 잘림 + 토스트 "최대 500자"
- **파일**: `specs/composer.spec.tsx`

### TS-15 Rate limit 429
- **Given**: 정상 시스템
- **When**: 1분 11회 /api/chat 호출
- **Then**: 11회째 429 + Retry-After 헤더 + UI 카운트다운
- **파일**: `specs/chat-route.spec.ts:rateLimit`

### TS-16 일별 토큰 한도 초과
- **Given**: 일별 토큰 카운트 = MAX_TOKENS_PER_DAY
- **When**: /api/chat 호출
- **Then**: 503 + 안내 페이지 "오늘은 너무 많은 분이 와주셨어요"
- **파일**: `specs/chat-route.spec.ts:dailyCap`

### TS-17 모델 키 401
- **Given**: 잘못된 OPENAI_API_KEY
- **When**: GPT 모델 호출
- **Then**: 사용자에게 "이 모델은 일시적으로 사용 불가, GPT로 시도?" 폴백 버튼 (다른 모델 fallback)
- **파일**: `specs/chat-route.spec.ts:modelAuth`

### TS-18 임베딩 다운 → 키워드 폴백
- **Given**: 임베딩 API 503
- **When**: /api/chat 호출
- **Then**: keyword-only retrieval 응답, header `X-Retrieval-Mode: keyword-only`
- **파일**: `specs/retriever.spec.ts:embeddingDown`

### TS-19 피드백 👎 → Notion
- **Given**: 어시스턴트 메시지 + 답변 만족 안 함
- **When**: 👎 → reason "관련 내용이 부족해요" 선택 → 제출
- **Then**: 토스트 + msw로 Notion API 호출 1회 + DB row 검증
- **파일**: `specs/feedback-route.spec.ts`, `tests/e2e/chat.e2e.ts:feedback`

### TS-20 같은 메시지 👎 중복
- **Given**: 한 번 👎 제출
- **When**: 같은 버튼 다시 클릭
- **Then**: disabled, 두 번째 호출 X
- **파일**: `specs/feedback-button.spec.tsx`

### TS-21 첫 토큰 5초 지연
- **Given**: 모델 응답이 느림
- **When**: 5초 경과
- **Then**: typing dots 옆 "응답 준비 중" 보조 텍스트
- **파일**: `specs/typing-indicator.spec.tsx`

### TS-22 SSE 연결 끊김
- **Given**: streaming 도중
- **When**: 네트워크 끊김
- **Then**: 부분 응답 보존 + 빨간 인디케이터 + 재시도 버튼
- **파일**: `specs/chat-route.spec.ts:sseDisconnect`

---

## 사이드 메뉴

### TS-23 햄버거 → 시트 열림
- **Given**: 시트 닫힘
- **When**: 햄버거 클릭
- **Then**: 슬라이드인 + body lock + focus trap (첫 항목 focus)
- **파일**: `specs/side-sheet.spec.tsx:open`

### TS-24 ESC로 닫기
- **Given**: 시트 열림
- **When**: ESC
- **Then**: 닫힘 + 햄버거 버튼 focus 복귀
- **파일**: `specs/side-sheet.spec.tsx:escClose`

### TS-25 overlay 클릭으로 닫기
- **Given**: 시트 열림
- **When**: overlay 클릭
- **Then**: 닫힘
- **파일**: `specs/side-sheet.spec.tsx:overlayClose`

### TS-26 메뉴 항목 클릭 → 라우트 이동 + 자동 close
- **Given**: 시트 열림
- **When**: "커리어" 클릭
- **Then**: `/experience` 진입 + 시트 닫힘
- **파일**: `tests/e2e/side-menu.e2e.ts:navigation`

### TS-27 키보드 화살표 네비게이션
- **Given**: 시트 열림 (Tab 전)
- **When**: ↓ → ↑ → Enter
- **Then**: 메뉴 항목 포커스 이동, Enter로 진입
- **파일**: `specs/side-sheet.spec.tsx:keyboardNav`

### TS-28 모바일 풀스크린 vs 데스크톱 사이드 패널
- **Given**: 6 디바이스 매트릭스
- **When**: 햄버거 클릭
- **Then**: sm 미만 = w-screen, md+ = w-[320px]
- **파일**: `tests/visual/breakpoints.spec.ts`

### TS-29 라우트 변경 시 자동 close
- **Given**: 시트 열림
- **When**: 브라우저 뒤로 / 직접 URL push
- **Then**: 자동 close
- **파일**: `tests/e2e/side-menu.e2e.ts:autoCloseOnNav`

### TS-30 가로/세로 회전
- **Given**: 시트 열림 (모바일 세로)
- **When**: 가로 회전
- **Then**: 폭 재계산, 콘텐츠 자연 정렬
- **파일**: `tests/e2e/side-menu.e2e.ts:rotate`

### TS-31 빠른 toggle 연타
- **Given**: 햄버거
- **When**: 100ms 간격 5회 클릭
- **Then**: 80ms debounce, 마지막 상태 settle
- **파일**: `specs/side-sheet.spec.tsx:debounce`

### TS-32 Reduced motion
- **Given**: prefers-reduced-motion=reduce
- **When**: 햄버거 클릭
- **Then**: 슬라이드 애니메이션 0, 즉시 표시
- **파일**: `specs/side-sheet.spec.tsx:reducedMotion`

---

## About 페이지

### TS-33 페이지 직접 진입
- **Given**: URL `/about` 직접 입력
- **When**: 진입
- **Then**: SSG 렌더, 헤더/푸터 정상, 사이드 메뉴 닫힘
- **파일**: `tests/e2e/about.e2e.ts:directAccess`

### TS-34 노션 프로필 비어 있는 상태
- **Given**: NOTION_PROFILE_PAGE_IDS 미설정 또는 빈 페이지
- **When**: 빌드
- **Then**: "준비 중" placeholder 노출, 빌드 성공
- **파일**: `tests/e2e/about.e2e.ts:emptyProfile`

### TS-35 reading-time 계산
- **Given**: 본문 N자
- **When**: 페이지 렌더
- **Then**: 상단 "약 X분" 표기 (N/300)
- **파일**: `specs/reading-time.spec.ts`

### TS-36 이미지 로드 실패 → fallback
- **Given**: 프로필 이미지 URL 깨짐
- **When**: 페이지 진입
- **Then**: SVG 이니셜 fallback
- **파일**: `tests/e2e/about.e2e.ts:imageFallback`

### TS-37 모바일 1컬럼 / 데스크톱 max-w-2xl
- **파일**: `tests/visual/breakpoints.spec.ts:about`

---

## Experience 페이지

### TS-38 페이지 직접 진입
- **파일**: `tests/e2e/experience.e2e.ts:directAccess`

### TS-39 통합 커리어 타임라인 — 이력서 단일 소스 렌더 (2026-07 중복 fix)
- **Given**: 이력서(career 청크)에 회사 경력 + 자체 프로젝트 항목 (같은 blockquote 포맷)
- **When**: `/experience` 커리어 타임라인 렌더
- **Then**: 자체 프로젝트 1건 포함 하나의 타임라인 — project 청크는 미사용 (중복 원천 차단, ADR-032)
- **파일**: `specs/components/experience-page.spec.tsx:unifiedTimeline`

### TS-40 통합 타임라인 파싱·정렬
- **Given**: 이력서 커리어 마크다운 (회사 3 + 자체 프로젝트 1)
- **When**: `buildUnifiedTimeline(careerBody)`
- **Then**: 시작일 내림차순 정렬, 기간 없는 항목 마지막, 자체 프로젝트 role="" (폴백 없음)
- **파일**: `specs/experience-timeline.spec.ts:merge`

### ~~TS-41 외부 링크 → 노션 새 탭~~ (폐기 — 2026-07 이력서 단일 소스 개편으로 타임라인의 노션 링크 제거)

### TS-42 모바일 horizontal / 데스크톱 vertical sticky
- **파일**: `tests/visual/breakpoints.spec.ts:experience`

---

## Contact 페이지 / 폼

### TS-43 페이지 직접 진입
- **파일**: `tests/e2e/contact.e2e.ts:directAccess`

### TS-44 정상 제출
- **Given**: 정상 폼 값 (이름·이메일·메시지)
- **When**: 제출
- **Then**: 토스트 "메시지를 받았어요" + 폼 reset + Notion DB row 생성 (msw mock)
- **파일**: `tests/e2e/contact.e2e.ts:happyPath`, `specs/contact-route.spec.ts`

### TS-45 빈 필드 검증
- **Given**: 필수 필드 빔
- **Then**: 인라인 에러 표시, 제출 불가
- **파일**: `specs/contact-form.spec.tsx:emptyValidation`

### TS-46 이메일 형식 위반
- **Given**: "abc"
- **Then**: "올바른 이메일 형식이 아니에요"
- **파일**: `specs/contact-form.spec.tsx:emailFormat`

### TS-47 이름 길이 위반
- **Given**: 0자 또는 41자
- **Then**: 인라인 에러
- **파일**: `specs/contact-form.spec.tsx:nameLength`

### TS-48 메시지 길이 위반
- **Given**: 9자 또는 2001자
- **Then**: 인라인 에러
- **파일**: `specs/contact-form.spec.tsx:messageLength`

### TS-49 honeypot 채워짐
- **Given**: B(봇) — `website` 필드 채움
- **When**: 제출
- **Then**: 200 응답하지만 Notion 저장 안 됨 (이중 검증)
- **파일**: `specs/contact-route.spec.ts:honeypot`

### TS-50 1.5초 미만 제출
- **Given**: B
- **When**: 진입 즉시 제출
- **Then**: 봇 의심 → 거부 (또는 captcha 옵션)
- **파일**: `specs/contact-route.spec.ts:tooFast`

### TS-51 rate limit 429
- **Given**: 같은 IP 1분 4회 시도
- **Then**: 4회째 429
- **파일**: `specs/contact-route.spec.ts:rateLimit`

### TS-52 Notion 5xx
- **Given**: Notion 503
- **When**: 정상 폼 제출
- **Then**: 1회 재시도 → 실패 → Resend 폴백 → mailto 노출
- **파일**: `specs/contact-route.spec.ts:notionDown`

### TS-53 Resend 미설정
- **Given**: RESEND_API_KEY 없음
- **When**: 정상 폼 제출
- **Then**: 노션만 성공, 알림은 silent
- **파일**: `specs/contact-route.spec.ts:resendOptional`

### TS-54 NOTION_CONTACT_DB_ID 미설정
- **Given**: 환경변수 없음
- **When**: 폼 제출
- **Then**: 503 + "직접 메일 주세요" mailto 카드 강조
- **파일**: `specs/contact-route.spec.ts:dbIdMissing`

### TS-55 자동완성 attribute
- **Given**: 폼 필드들
- **Then**: name="given-name"(이름), type="email" autocomplete="email", honeypot tabindex=-1 aria-hidden
- **파일**: `specs/contact-form.spec.tsx:autocomplete`

### TS-56 페이지 이탈 경고
- **Given**: 작성 중 폼
- **When**: 뒤로/탭 닫기
- **Then**: beforeunload 경고 표시
- **파일**: `tests/e2e/contact.e2e.ts:beforeUnload`

### TS-57 이메일 + alias
- **Given**: `me+a@gmail.com`
- **Then**: 통과
- **파일**: `specs/contact-form.spec.tsx:emailAlias`

### TS-58 이름 한국어/공백
- **Given**: "김 윤수"
- **Then**: 통과
- **파일**: `specs/contact-form.spec.tsx:nameKorean`

### TS-59 한국어 IME로 이메일 (한글 입력)
- **Given**: 이메일 필드에 "안녕"
- **Then**: 검증 실패 인라인 에러
- **파일**: `specs/contact-form.spec.tsx:emailKorean`

### TS-60 모바일 키보드 가림
- **Given**: 모바일 디바이스
- **When**: 메시지 textarea focus
- **Then**: visualViewport 보정으로 입력창 항상 보임
- **파일**: `tests/e2e/contact.e2e.ts:mobileKeyboard`

---

## 횡단 (전 페이지 공통)

### TS-61 키보드만으로 모든 페이지 인터랙션
- **Given**: A 페르소나
- **Then**: Tab 순서 자연스러움, focus visible, 모든 액션 도달 가능
- **파일**: `tests/e2e/cross-cutting.e2e.ts:keyboardNav`

### TS-62 색 대비 WCAG AA (axe-core)
- **파일**: `tests/e2e/cross-cutting.e2e.ts:axe`

### TS-63 SEO meta + JSON-LD
- **Given**: 각 페이지
- **Then**: title/description/og:image/twitter/robots/sitemap meta 존재 + JSON-LD Person 파싱 성공
- **파일**: `tests/e2e/cross-cutting.e2e.ts:seo`

### TS-64 Open Graph image 응답
- **Given**: `/opengraph-image`
- **Then**: 200 + Content-Type image/png
- **파일**: `tests/e2e/cross-cutting.e2e.ts:og`

### TS-65 not-found 페이지
- **Given**: 임의 라우트 `/xyz`
- **Then**: 404 친절 페이지 + 홈 링크 + robots noindex
- **파일**: `tests/e2e/cross-cutting.e2e.ts:notFound`

### TS-66 1세션 라우트 왕복
- **Given**: 채팅 → about → experience → contact → 채팅
- **Then**: 사이드메뉴 자동 close, 채팅 메시지 stateless 비워짐, greeted 플래그 유지
- **파일**: `tests/e2e/cross-cutting.e2e.ts:roundtrip`

### TS-67 푸터 마지막 업데이트
- **Given**: portfolio.server.json `generatedAt = 2026-05-06T10:00:00Z`
- **Then**: 푸터에 "마지막 업데이트: 2026-05-06" (KST)
- **파일**: `specs/footer.spec.tsx`

### TS-68 Lighthouse Performance/A11y/Best Practices/SEO
- **Threshold**: 90/95/95/95
- **파일**: `lhci.config.js` (CI)

### TS-69 Critical bundle audit
- **Given**: `npm run build`
- **Then**: 클라이언트 청크에 임베딩 패턴 0건, gzipped JS < 250KB
- **파일**: `scripts/audit-bundle.ts` + CI 스크립트

### TS-70 환경변수 누락 시 기동
- **Given**: 부분 환경변수 누락
- **Then**:
  - OPENAI 누락 → 채팅 503 + 정적 페이지는 정상
  - NOTION 누락 → 빌드 실패
  - NOTION_CONTACT_DB_ID 누락 → Contact 503 + 다른 페이지 정상
- **파일**: `tests/e2e/cross-cutting.e2e.ts:envFallback`

### TS-71 ChatRoot 레이아웃 순서 (FEAT-030)
- **Given**: ChatRoot 렌더
- **Then**: header → scroll-area → JumpToLatest → SuggestionCarousel(위쪽 border-t) → Composer form 순서
- **파일**: `specs/components/chat-layout.spec.tsx`

### TS-72 Composer prominent box (FEAT-030)
- **Given**: Composer 렌더
- **Then**: 외곽 form `rounded-3xl` + `border-line-strong` + `bg-elevated/40`, 액션 row 가 textarea 직하단 `justify-between`
- **파일**: `specs/components/composer.spec.tsx`

### TS-73 ModelSwitcher 위치 (FEAT-030)
- **Given**: ChatRoot 렌더
- **Then**: ModelSwitcher 가 Header 가 아닌 Composer 내부에 렌더
- **파일**: `specs/components/model-switcher.test.tsx`

### TS-74 프로필 이미지 정적 asset (FEAT-032)
- **Given**: `oneLiner` 에 노션 이미지 마크다운 존재/부재
- **When**: 자기소개(/about) 히어로 렌더
- **Then**: 이미지 있으면 정적 asset `/images/profile.jpg`(next/image), 없으면 이니셜 `ProfileFallback`
- **파일**: `specs/profile-image.spec.ts`

### TS-83 통합 커리어 타임라인 (FEAT-025, 2026-07 이력서 단일 소스)
- **Given**: 이력서(career 청크)의 회사 경력 + 자체 프로젝트 항목
- **When**: `/experience` 렌더
- **Then**: 시작일 내림차순 하나의 타임라인 — 회사 행(회사·직함·기간·프로젝트 그룹), 자체 프로젝트 행("자체 프로젝트" 라벨·기간·프로젝트명·불릿, 직함 없음)
- **파일**: `specs/components/experience-page.spec.tsx` + `specs/experience-timeline.spec.ts`

### TS-84 학력·자격증 분리 섹션 (FEAT-025)
- **Given**: 이력서의 교육 기관·자격증 섹션 (자격증: AWS Certified AI Practitioner)
- **When**: `/experience` 하단 렌더
- **Then**: 학력=대학(학사)만(부트캠프 제외), 자격증=발급기관 부제 — `CredentialList` 행 리스트
- **파일**: `specs/components/experience-page.spec.tsx`, `specs/about-data.spec.ts`

### TS-81 랜딩 페이지 (FEAT-034)
- **Given**: `/` 랜딩 (타이핑 인사 + 칩 + 채팅 인풋 버튼)
- **When**: reduced-motion / 타이머 진행 / 칩·인풋 클릭
- **Then**: 즉시·단어단위 인사 표시, 칩 → `/chat?q=`, 인풋 → `/chat` push
- **파일**: `specs/components/landing-hero.spec.tsx`

### TS-82 커리어 타임라인 재구성 (FEAT-025 회귀 방지)
- **Given**: ADR-028 구조의 career 청크(order 뒤섞임, 헤딩은 headingPath 에만)
- **When**: `loadProfileData().career`
- **Then**: order 순 정렬 + `###` 헤딩 재합성으로 타임라인 마크다운 복원 (교육/이름 청크 제외)
- **파일**: `specs/about-data.spec.ts`

---

## 매핑 SSoT
spec.json `testScenarios[].file` 가 위 "파일" 항목과 1:1 일치해야 함. 누락 시 `npm run check:spec` fail.
