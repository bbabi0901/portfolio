# components/chat/ — 챗 UI (도메인 스코프 규칙)

> 이 파일은 챗 컴포넌트를 수정할 때만 로드된다. 전역 디자인 규칙은 루트 CLAUDE.md + docs/UI_GUIDE.md가 우선.

## 데이터 흐름 계약
- `ChatRoot`는 `@ai-sdk/react` `useChat` + `TextStreamChatTransport` — 서버는 **plain text 스트림**을 반환한다 (SSE data 프로토콜 아님). 전송부를 바꾸면 서버 스트림 포맷과 함께 바꿔야 함.
- 응답 헤더 계약: `X-Model-Id`(표시), `X-Model-Substitution: true`(토스트), `X-Retrieval-Mode`(검색 모드). 헤더 이름 변경은 integration 테스트(specs/chat-route.spec.ts)와 동기.
- 모델 선택은 localStorage 키 `portfolio.model`에 저장. **저장값이 available 목록에 없으면 default로 폴백** — 이 동작은 specs/components/chat-root.spec.tsx가 가드.

## ModelSwitcher
- 라벨 맵(`MODEL_LABELS_LONG/SHORT`)은 `lib/models.ts`의 `ModelId` 유니온과 1:1 — 모델 추가 시 두 파일 동시 수정 (타입이 컴파일로 강제함).
- `available=[]`이면 피커 disabled + Composer placeholder 변경 (채팅 비활성 상태).

## 스타일
- 시맨틱 토큰만 사용 (`bg-surface`, `text-body` 등) — 하드코딩 Tailwind 색 금지. 애니메이션은 화이트리스트만. 마크다운 렌더는 `prose dark:prose-invert`.

## 테스트
- Unit: `specs/components/*.spec.tsx` (Testing Library). E2E: `tests/e2e/chat.e2e.ts` (MOCK_LLM=1). 사용자 가시 변경은 docs/TEST_SCENARIOS.md TS-XX 매핑 필수.
