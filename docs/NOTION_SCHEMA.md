# Notion Schema & Sync Policy

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, CONTENT_GUIDE.md, AI_CONTRACT.md, DEPLOY.md
**SSoT keys**: (외부 — Notion DB 스키마)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

## 데이터 소스 구조

```
Notion Workspace
├── 기록v2 (페이지)
│   ├── 🏠 홈
│   ├── 📚 학습 노트 (DB) — 동기화 제외
│   └── 📦 구 기록 (아카이브)
│       ├── 프로젝트 (DB) ← 동기화 대상
│       ├── 기획 (DB) — 제외
│       ├── 해야할일 (DB) — 제외
│       └── 여행 기록 (DB) — 제외
├── 김윤수 이력서 (페이지) ← 동기화 대상
└── (추가 예정) 자기소개/성격/취미/MBTI 페이지들 ← 화이트리스트 추가
```

## 화이트리스트

다음만 동기화 대상으로 삼는다. 환경변수로 ID 주입.

| 환경변수 | 의미 | 예시 |
|---|---|---|
| `NOTION_PROJECTS_DB_ID` | 프로젝트 DB | `ee21a52e-5e7f-4104-ba5a-9007f717664c` |
| `NOTION_PROFILE_PAGE_IDS` | 콤마 구분 페이지 ID 목록 (이력서 + 자기소개/성격/취미/MBTI) | `0d23b37e...,abc...,def...` |

### 프로젝트 DB 카테고리 필터
- **포함**: `자체프로젝트`, `업무`, `외부활동`
- **제외**: `교육` (개인 학습 기록 — 단 회사가 진행한 교육은 외부활동으로 분류 권장)

### 프로젝트 DB 상태 필터
- **포함**: `Done`, `In progress` (모두 노출)
- **제외**: `Not started` (아직 미시작은 답변에 부적절)

## 블랙리스트 (절대 동기화 안 함)
- 학습 노트 DB (개인 메모, 인용 시 부정확)
- 기획 DB (의사결정 과정, 외부 노출 부적절)
- 해야할일 DB
- 여행 기록 DB
- 사적 페이지 (예: 가족, 일기 등 — 페이지 ID로 명시 추가 안 함)

## Q&A 피드백 DB 스키마 (사용자가 사전 생성 필요)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| Title | title | 사용자 질문 (앞 80자 + …) |
| Question | rich_text | 전체 질문 |
| Answer | rich_text | 모델이 준 답변 |
| Reason | select | "정보가 정확하지 않아요" / "내가 원한 답이 아니에요" / "관련 내용이 부족해요" / "기타" |
| ReasonDetail | rich_text | 자유 입력 |
| Model | select | gpt-4o-mini / claude-3-5-haiku / gemini-2.0-flash |
| RetrievalChunks | rich_text | 검색된 sourceTitle 리스트 (디버깅용) |
| Status | status | 새 / 보강중 / 보강완료 / 무시 |
| Created | created_time | 자동 |
| UA hash | rich_text | user-agent sha256 앞 8자 (개인식별 X) |

환경변수: `NOTION_FEEDBACK_DB_ID`.

## Contact DB 스키마 (사용자가 사전 생성 필요)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| Title | title | 보낸 사람 이름 |
| Email | email | 이메일 |
| Message | rich_text | 메시지 |
| Created | created_time | 자동 |
| UA hash | rich_text | 추적용 (개인식별 X) |
| Status | status | 새 / 회신중 / 회신완료 |

환경변수: `NOTION_CONTACT_DB_ID`.

## 청킹 규칙

1. **단위**: heading (H1, H2, H3) 기준. heading 사이의 텍스트 + 뒤따르는 코드/리스트를 한 청크로.
2. **길이 목표**: 500–800 토큰 (`text-embedding-3-small` 기준). 너무 짧으면 다음 청크와 머지(≥ 200 토큰까지 흡수).
3. **상한**: 한 청크 최대 1500 토큰. 초과 시 sentence boundary 기준 분할.
4. **코드블록 보호**: 코드블록 중간에서 분할하지 않는다.
5. **이미지**: 본문 인라인 이미지는 alt/caption만 텍스트로 포함. URL은 보관(메타에 attachments[]).
6. **테이블**: 마크다운 테이블 그대로. 임베딩 시 행 단위 보존.
7. **페이지당 상한**: 30 청크. 초과 시 후반 잘림 + 빌드 경고.

## portfolio.server.json 출력 스키마 (zod)

```ts
export const PortfolioJSON = z.object({
  version: z.string(),                  // "1.0.0"
  generatedAt: z.string().datetime(),    // ISO, KST 표시는 UI에서
  profile: z.object({
    name: z.string(),                    // "김윤수"
    headline: z.string(),                // "3년차 프론트엔드 + 스마트컨트랙트 개발자"
    intro: z.string(),                   // 2–3문장
    contact: z.object({
      email: z.string().email(),
      github: z.string().url().optional(),
      linkedin: z.string().url().optional(),
    }),
  }),
  chunks: z.array(z.object({
    id: z.string(),                      // page-id::chunk-idx
    sourcePageId: z.string(),
    sourceTitle: z.string(),
    sourceUrl: z.string().url(),
    category: z.enum(["자체프로젝트", "업무", "외부활동", "프로필", "성격", "취미"]),
    company: z.string().optional(),       // 업무 카테고리만
    period: z.object({ start: z.string(), end: z.string().nullable() }).optional(),
    headingPath: z.array(z.string()),
    tags: z.array(z.string()),
    text: z.string(),
    tokens: z.number().int(),
    embedding: z.array(z.number()).length(1536),
  })),
  suggestedQuestions: z.array(z.object({
    id: z.string(),                       // Q-001
    category: z.string(),
    text: z.string(),
    expectedSourceTitles: z.array(z.string()),
  })),
  relatedQuestions: z.record(z.string(), z.array(z.string())),  // chunkId → Q-id[]
});
```

## suggestions.json 출력 스키마 (클라이언트 안전)

```ts
export const SuggestionsJSON = z.object({
  version: z.string(),
  generatedAt: z.string().datetime(),
  greeting: z.object({ message: z.string() }),
  suggestedQuestions: z.array(z.object({
    id: z.string(),
    category: z.string(),
    text: z.string(),
  })),
  profile: z.object({
    name: z.string(),
    headline: z.string(),
  }),
  contact: z.object({
    email: z.string().email(),
    github: z.string().url().optional(),
    linkedin: z.string().url().optional(),
  }).optional(),
});
```

→ **임베딩과 sourceUrl/원문 청크는 클라이언트에 절대 노출하지 않는다.**

## 동기화 절차 (`scripts/sync-notion.ts`)

1. 환경변수 검증 (`NOTION_TOKEN`, `NOTION_PROJECTS_DB_ID`, `NOTION_PROFILE_PAGE_IDS`).
2. 프로젝트 DB 쿼리 (카테고리·상태 필터).
3. 화이트리스트 페이지 fetch.
4. 각 페이지: 블록 트리 → 마크다운 (notion-to-md, ignore: child_database, file).
5. 마크다운 → 청크.
6. 청크 → 임베딩 (배치 100, exponential backoff 4회).
7. profile 한 줄 추출 (이력서 페이지 첫 H2 아래 첫 문단).
8. `data/portfolio.server.json` 기록.
9. 클라이언트용 `public/data/suggestions.json` 별도 추출.
10. 끝.

### 실패 시
- 노션 API 4xx (권한/없음): 해당 페이지 제외 + 빌드 계속.
- 노션 API 429: 백오프 4회 → 실패 시 빌드 실패.
- 노션 API 5xx: 백오프 4회 → 실패 시 마지막 성공 산출물 유지 + 빌드 계속(경고).
- 임베딩 API 다운: 마지막 성공 산출물 유지 + 빌드 계속(경고).
- 토큰 누락: 빌드 즉시 실패.
- portfolio.server.json 첫 생성 실패: 빌드 실패 (정적 사이트 빈 콘텐츠 방지).

## CONTENT_GUIDE 연계
사용자(소유자)가 노션에 어떤 식으로 작성하면 좋은지는 [CONTENT_GUIDE.md](CONTENT_GUIDE.md) 참조.
