# Pages — 와이어프레임 / 콘텐츠 / 엣지

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, PRD.md, UI_GUIDE.md, RESPONSIVE.md, AI_CONTRACT.md
**SSoT keys**: spec.pages, spec.forms, spec.features (UI 매핑)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

## 공통 layout (`app/layout.tsx`)

```
┌──────────────────────────────────────────────┐
│  Yoonsoo Kim                          [☰]    │  ← Header
├──────────────────────────────────────────────┤
│                                                │
│           {children — 페이지 컨텐츠}            │
│                                                │
├──────────────────────────────────────────────┤
│ 마지막 업데이트: 2026-05-06   GH·Mail   privacy│  ← Footer
└──────────────────────────────────────────────┘
```

햄버거 클릭 → 우측에서 SideSheet 슬라이드 (FEAT-023).

```
┌────────────┐
│   메뉴   ✕ │
├────────────┤
│ ● 대화     │  ← active (lime-300 left border)
│ ○ 자기소개 │
│ ○ 커리어   │
│ ○ 연락하기 │
├────────────┤
│ GH · Mail  │
│ 마지막 업뎃│
└────────────┘
```

---

## `/` 랜딩 (FEAT-034)

### 와이어프레임 (모바일)
```
┌────────────────────────┐
│ Header  [≡]            │
├────────────────────────┤
│                        │
│      (아바타●)          │  프로필 이미지 + lime 상태 점
│                        │
│  안녕하세요, 프론트엔드   │  ← 타이핑 효과 (단어 단위,
│  개발자 김윤수입니다.     │     reduced-motion 시 즉시)
│  궁금한 건 무엇이든       │
│  물어보세요.             │
│                        │
│ (칩)(칩)(칩)(칩)         │  추천 질문 4개 → 클릭 시 /chat?q=
│                        │
│ ┌────────────────────┐ │
│ │ 궁금한 것 물어보기 (→)│ │  채팅 인풋 모양 버튼 → /chat 이동
│ └────────────────────┘ │
├────────────────────────┤
│ Footer                 │
└────────────────────────┘
```

### 동작
- 인사말 타이핑은 매 방문 재생 (chat greeting 의 30일 기억과 무관).
- 칩 클릭 → `/chat?q=질문` — ChatRoot 가 마운트 시 1회 자동 전송 후 URL 정리.
- 인풋 버튼 클릭/포커스 → `/chat` (hover/focus 시 prefetch).
- 레퍼런스: leahkim.design 레이아웃 차용, 색은 시맨틱 토큰(neutral+lime)·안티 AI-슬롭 준수.

---

## `/chat` 채팅 (대화) — 기존 `/` 에서 이전 (FEAT-034)

### 와이어프레임 (모바일, FEAT-030 갱신)
```
┌────────────────────────┐
│ Header  [≡]            │  ModelSwitcher 는 Header 에서 제거
├────────────────────────┤
│                        │
│   AI: 안녕하세요! ... │
│   ↑ greeting (sim)     │
│                        │
│   [↓ 최신으로]          │  JumpToLatestButton (sticky bottom)
├────────────────────────┤
│ [질문1][질문2][질문3]→  │  Carousel (Composer 직상단, 넛지)
├────────────────────────┤
│ ╭────────────────────╮ │  Composer (rounded-3xl 큰 박스)
│ │ 메시지를 입력하…    │ │
│ │                    │ │
│ │ [Opus 4.7 ▾] [⤴]   │ │  좌하단 ModelSwitcher / 우하단 Send
│ ╰────────────────────╯ │
└────────────────────────┘
```

**순서 (FEAT-030, TS-71)**: `Header → MessageList(scroll-area, flex-1) → JumpToLatestButton(sticky) → SuggestionCarousel → Composer`.

### 데이터
- `public/data/suggestions.json` (RSC fetch → Client에 전달)
- 채팅 메시지: `useChat` 메모리

### 인터랙션
- 첫 진입: GreetingPlayer 시뮬레이션 (FEAT-014, 8.9 시퀀스)
- 추천 질문 클릭 → 즉시 전송 (FEAT-003)
- 메시지 hover/long-press → MessageActionsBar (Copy / Regenerate / Try-other / 출처)
- 👎 → FeedbackPopover → POST /api/feedback
- 모델 변경 → ModelSwitcher (localStorage 저장)
- "새 대화" → ClearConversationButton (Cmd+K)
- 위로 스크롤 → JumpToLatestButton

### 엣지/에러
- EC-01~EC-31, ERR-01~ERR-08, ERR-13~ERR-17 적용.

---

## `/about` 자기소개

### 와이어프레임
```
┌────────────────────────┐
│ Header                 │
├────────────────────────┤
│  [프로필 이미지 96~128] │
│                        │
│  김윤수                │
│  3년차 프론트엔드 +    │
│  스마트컨트랙트         │
│                        │
│  안녕하세요. 저는 ...  │
│                        │
│  ## 가치관              │
│  ...                   │
│                        │
│  ## 성격 / MBTI         │
│  ... (노션 콘텐츠)      │
│                        │
│  ## 취미                │
│  ... (노션 콘텐츠)      │
│                        │
│  → "커리어가 궁금하다면?"│
│      [커리어 보기 →]     │
├────────────────────────┤
│ Footer                 │
└────────────────────────┘
```

### 데이터
- `data/portfolio.server.json`의 카테고리 = `프로필`/`성격`/`취미` 청크들 (서버 import)
- 학력 섹션은 2026-07 개편으로 `/experience` 로 이동 (TS-75 — 대학(학사)만 렌더).
- 마크다운 → MDX 컴포넌트로 렌더 (`@next/mdx` 또는 `next-mdx-remote/rsc`)
- **프로필 이미지 (FEAT-032)**: 노션 자기소개 히어로 이미지는 서명 만료되는 S3 URL 이라 직접 참조 불가.
  → 커밋된 정적 asset `public/images/profile.jpg` (512×512, EXIF/GPS strip, 수동 갱신) 사용.
  `lib/profile-data.ts`의 `resolveProfileImageUrl()`가 `oneLiner`에 이미지 마크다운이 있으면 이 경로를,
  없으면 `null`(이니셜 `ProfileFallback`)을 반환. 갱신은 노션 이미지 재다운로드 → 동일 경로 덮어쓰기.

### 인터랙션
- "대화로 이어가기 →" 버튼 → `/?q={prefilled}` 또는 단순 `/` 이동.
- 이미지 클릭 → 확대 (옵션, MVP 제외).

### 엣지/에러
- EC-36, ERR-24 적용.
- 이미지 로드 실패 → SVG 이니셜 fallback.
- 콘텐츠 매우 길면 reading-time 상단 표기 ("약 X분").

### 메타
- title: "자기소개"
- description: "프론트엔드 개발자 김윤수의 가치관, 성격, 취미."

---

## `/experience` 커리어 (2026-07 개편)

### 구조 (위→아래)
1. **커리어 타임라인 (통합)** — 회사 경력(career 청크 재구성)과 **자체 프로젝트**
   (project 청크, notionCategory=자체프로젝트)를 시작일 내림차순 하나의 타임라인으로 병합
   (`lib/experience-timeline.ts` buildUnifiedTimeline → `UnifiedTimeline`).
   - 회사 행: 좌측 회사명·직함·기간, `###` 프로젝트 제목 그룹 + 불릿.
   - 자체 프로젝트 행: 좌측 "자체 프로젝트" 라벨+기간, 우측 제목·설명·태그(≤5)·노션 링크(↗).
   - 진행 중 항목은 brand 점. 기간은 노션 프로젝트 DB `기간`(date) → `projectMeta.period`.
2. **학력** (분리 섹션, `CredentialList`) — **대학(학사)만 렌더, 부트캠프 제외**
   (extractEducation: heading 대학|university 매칭). /about 에서 이동.
3. **자격증** (분리 섹션, `CredentialList`) — 노션 이력서 "자격증 (Certification)" 섹션 소싱.
   현재: AWS Certified AI Practitioner (Amazon Web Services).
4. **보유 스킬** (SkillsGrid, 기존 유지).
- 구 '프로젝트' 섹션(카테고리 필터+카드)은 제거 — 업무 프로젝트가 커리어 불릿과 중복.
- 커리어 파서: `lib/career-markdown.ts` (H2 경계 밖 merge 금지 + 흡수 섹션 헤딩 재주입은 청커).

### 와이어프레임 (데스크톱)
```
┌──────────────────────────────────────────┐
│ Header                                   │
├──────────────────────────────────────────┤
│ [전체] [자체프로젝트] [업무] [외부활동]      │  ← CategoryFilter
│                                          │
│ ┌─ 디라티오 (2025.01–현재) ────────────┐ │
│ │ Senior Frontend Engineer             │ │
│ │  ▸ MFE 마이그레이션 TF (...)          │ │
│ │  ▸ 밈코인 통합 소셜 플랫폼 (...)       │ │
│ │  ▸ 어드민 페이지 (단독)               │ │
│ └─────────────────────────────────────┘ │
│ ┌─ 체인아나토미 (2023.05–2025.01) ──────┐ │
│ │ Smart Contract & Frontend Engineer   │ │
│ │  ▸ ...                                │ │
│ └─────────────────────────────────────┘ │
│ ┌─ 반에프 (2020.09–2022.04) ────────────┐ │
│ │ Software Engineer (ML/CV)            │ │
│ │  ▸ ...                                │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ## Skills                                │
│ Frontend: TypeScript · React · Next ...  │
│ Smart Contract: Solidity · Foundry ...   │
├──────────────────────────────────────────┤
│ Footer                                   │
└──────────────────────────────────────────┘
```

### 와이어프레임 (모바일)
- 상단 horizontal CategoryFilter
- 회사 → 프로젝트 카드 vertical stack
- timeline은 좌측 indicator 점만

### 데이터
- 회사/기간/직무: 이력서 페이지에서 추출 (sync-notion 시점).
- 프로젝트: `portfolio.server.json` 카테고리=`업무`/`외부활동` chunk들의 메타 그룹화.

### 인터랙션
- 프로젝트 카드 클릭 (또는 ▸ 펼침): 본문 중요 키워드 expand.
- "노션에서 자세히" 버튼: 새 탭으로 sourceUrl.
- CategoryFilter: URL `?category=업무` 동기화.

### 엣지/에러
- EC-37, EC-45 적용.
- 결과 0개 → 빈 상태 ("이 카테고리에 해당하는 프로젝트가 없어요. 다른 카테고리를 선택해 보세요.").

---

## `/contact` 연락하기

### 와이어프레임
```
┌────────────────────────┐
│ Header                 │
├────────────────────────┤
│ ## 연락하기              │
│ 협업·채용 문의는 폼 또는 │
│ 직접 메일로 보내주세요.  │
│                        │
│ ┌── ContactForm ─────┐ │
│ │ 이름     [______]  │ │
│ │ 이메일   [______]  │ │
│ │ 메시지   [______]  │ │
│ │          [______]  │ │
│ │          (10–2000자)│ │
│ │ (honeypot hidden) │ │
│ │       [보내기 →]   │ │
│ └────────────────────┘ │
│                        │
│ ## 직접 연락             │
│ Email   bbabi0901@... │
│ GitHub  YoonsooKim9    │
│ Phone   010-3288-2712  │
├────────────────────────┤
│ Footer                 │
└────────────────────────┘
```

### 폼 검증 규칙
| 필드 | 규칙 |
|---|---|
| 이름 | 필수, trim 후 1–40자 |
| 이메일 | 필수, zod `.email()`. 한글 입력 차단 |
| 메시지 | 필수, 10–2000자 |
| website (honeypot) | 비어 있어야 함 |

### 인터랙션
- 클라이언트 + 서버 검증 (동일 zod 스키마 import).
- 제출 → 버튼 disabled + spinner.
- 성공 토스트 → 폼 reset.
- 실패 토스트 → 폼 값 유지 + 에러 코드 표시 (작게).

### 엣지/에러
- EC-38~EC-43, ERR-21~ERR-23, ERR-26~ERR-27 적용.
- NOTION_CONTACT_DB_ID 미설정 → 503 + mailto 카드 강조.

### 메타
- title: "연락하기"

---

## `/not-found`

### 와이어프레임
```
┌────────────────────────┐
│ Header                 │
├────────────────────────┤
│   404                  │
│   페이지를 찾을 수 없어요│
│   [홈으로 →]            │
├────────────────────────┤
│ Footer                 │
└────────────────────────┘
```

- robots: noindex, nofollow.

---

## 페이지 간 라우팅 정책 (FEAT-029)

- 사이드 메뉴 항목 클릭 → push + auto-close.
- 라우트 변경 시:
  - 채팅 페이지 떠남 → in-flight 응답 abort.
  - 스크롤 자동 top.
  - 사이드 메뉴 자동 close (브라우저 뒤/앞도 동일).
- 직접 URL 진입 (예: `/contact`) → 사이드 메뉴 닫힘 상태.
- prefers-reduced-motion → 페이지 전환 fade 0.

## 페이지 공통 검증
- 모든 페이지: SEO 메타 export 필수.
- 모든 페이지: a11y 키보드 인터랙션 100%.
- 모든 페이지: 6 디바이스 매트릭스 시각 회귀 통과.
- 모든 페이지: Lighthouse 90/95/95/95 이상.
