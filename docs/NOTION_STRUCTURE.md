# Notion Workspace Structure

> 이 문서는 본 포트폴리오와 동기화되는 노션 워크스페이스의 **실제 페이지 위치와 역할**을 정리한다.
> **이 프로젝트가 참조하는 단일 진실 소스(SSoT) = `기록` 페이지**. 그 외 영역은 sync 대상이 아니다.
> 데이터 스키마·zod 정의는 [`NOTION_SCHEMA.md`](./NOTION_SCHEMA.md), 콘텐츠 작성 가이드는 [`CONTENT_GUIDE.md`](./CONTENT_GUIDE.md) 참조.

## 워크스페이스 메타

| 항목 | 값 |
|---|---|
| 워크스페이스 이름 | **Kiri CO.** |
| Notion Integration | **Portfolio** (Internal Integration, bot user) |
| Integration 토큰 환경변수 | `NOTION_TOKEN` |
| 접근 권한 부여 방식 | 각 페이지·DB 우측 상단 `...` → Connections → `Portfolio` 추가 |

## 페이지 트리

```
기록  (aa07726c-a535-4985-8b41-7123b06e235d)        ← 본 프로젝트의 단일 진실 소스 (SSoT)
├── 자기소개                  (363656db-6947-80d0-9c9c-eca1d37c2ba1)   📥 sync · personal
├── 이력서                    (0d23b37e-f6bb-42a2-acf8-5b33be3ea98a)   📥 sync · career
├── 프로젝트 (DB)             (45b65a79-1ab6-4ab3-aba8-72a84c3ca655)   📥 sync · project
│   └── 대화형 포트폴리오 (row, 369656db-6947-8101-8487-f6762b3e0f8c)
│       ├── Q&A 피드백 (DB)    (369656db-6947-8168-b2d8-fbb4dc0fd5e6)   ✏️ write
│       └── Contact (DB)       (369656db-6947-81c5-a4e0-f426a746e4d6)   ✏️ write
├── 스터디 (DB)               (f9ef6e77-e3a0-4b50-9296-810d844c865c)   ⛔ skip
└── 트러블슈팅 (DB)            (c4d7c55d-2f87-4d5e-9f12-e4a310623a98)   📥 sync · 트러블슈팅 · 상태=완료만
```

> **참고**: 워크스페이스에 별도로 존재하는 `📖 기록v2` 페이지 트리는 본 프로젝트의 동기화 대상이 아니다. 사용자가 점진적으로 정리·제거 예정이며, 이 문서에서는 다루지 않는다.

## 페이지별 역할 표

### 📥 동기화 대상 (`sync-notion.ts`가 읽어가는 페이지)

| 페이지 / DB | ID | 환경변수 | 카테고리 매핑 | 역할 |
|---|---|---|---|---|
| **이력서** | `0d23b37e-…` | `NOTION_PROFILE_PAGE_IDS` | `career` ([`scripts/sync-notion.ts:91`](../scripts/sync-notion.ts#L91)) | 직무·연차·헤드라인·이력 추출 + 청크 임베딩. `/about` 인트로 + 챗봇 RAG. |
| **자기소개** | `363656db-…` | `NOTION_PROFILE_PAGE_IDS` | `personal` ([`scripts/sync-notion.ts:92`](../scripts/sync-notion.ts#L92)) | 인성·MBTI·취미·장단점. H2 단위 청크. `/about` 섹션 + 챗봇 RAG. |
| **프로젝트 (DB)** | `45b65a79-…` | `NOTION_PROJECTS_DB_ID` | `project` ([`scripts/sync-notion.ts:95`](../scripts/sync-notion.ts#L95)) | 카테고리=`자체프로젝트`/`업무`/`외부활동` + 상태=`Done`/`In progress`만 동기화. `/experience` 카드 + 챗봇 RAG. |
| **트러블슈팅 (DB)** | `c4d7c55d-…` | `NOTION_TROUBLESHOOTING_DB_ID` | `트러블슈팅` | 상태=`완료`/`Done`인 항목만 동기화. 트러블슈팅 RAG. |

> **NOTION_EXTRA_PAGE_IDS**: 쉼표 구분 page ID 목록. 개별 기술/서브페이지를 `subpage` 카테고리로 RAG 동기화.

### ✏️ 쓰기 대상 (사용자 입력이 노션 DB로 적재)

| DB | ID | 환경변수 | 적재 트리거 |
|---|---|---|---|
| **Q&A 피드백** | `369656db-…8168` | `NOTION_FEEDBACK_DB_ID` | 챗봇 답변에 👎 + Reason 선택 시 `/api/feedback` |
| **Contact** | `369656db-…81c5` | `NOTION_CONTACT_DB_ID` | Contact 폼 제출 시 `/api/contact` |

> 두 DB는 프로젝트 DB의 **"대화형 포트폴리오" row(`369656db-…8101`)** 하위에 위치. 즉, "본 프로젝트에 연결된 운영 데이터"라는 의미.
> 컬럼·옵션 스키마는 [`NOTION_SCHEMA.md`](./NOTION_SCHEMA.md) L43~71 참조.

### ⛔ 동기화 제외 (skip)

| 페이지 / DB | ID | 이유 |
|---|---|---|
| 스터디 (DB) | `f9ef6e77-…` | 개인 학습 노트성. RAG 컨텍스트로 부적합. |

## 환경변수 빠른 참조

`.env.local`(git 미커밋, 로컬·Vercel만 보관):

```
NOTION_TOKEN=ntn_...                                    # Portfolio integration
NOTION_PROJECTS_DB_ID=45b65a79-1ab6-4ab3-aba8-72a84c3ca655
NOTION_PROFILE_PAGE_IDS=0d23b37e-f6bb-42a2-acf8-5b33be3ea98a,363656db-6947-80d0-9c9c-eca1d37c2ba1
NOTION_FEEDBACK_DB_ID=369656db-6947-8168-b2d8-fbb4dc0fd5e6
NOTION_CONTACT_DB_ID=369656db-6947-81c5-a4e0-f426a746e4d6
NOTION_TROUBLESHOOTING_DB_ID=c4d7c55d-2f87-4d5e-9f12-e4a310623a98   # optional
NOTION_EXTRA_PAGE_IDS=<page-id-1>,<page-id-2>                         # optional, 쉼표 구분
```

## 카테고리 매핑 로직 요약

[`scripts/sync-notion.ts:88`](../scripts/sync-notion.ts#L88) `resolveCategory()`:

1. **`NOTION_TROUBLESHOOTING_DB_ID` 출처일 때** → `트러블슈팅`
2. **`NOTION_EXTRA_PAGE_IDS` 출처일 때** → `subpage`
3. **페이지 ID가 `NOTION_PROFILE_PAGE_IDS`에 있을 때**
   - 페이지 제목에 `"이력서"` 또는 `"resume"` 포함 → `career`
   - 그 외 → `personal`
4. **프로젝트 DB row일 때**
   - 카테고리 = `자체프로젝트` / `업무` / `외부활동` → `project`
5. **그 외** → `subpage` (참고 청크)

## 새 페이지 추가 시 절차

콘텐츠 작성 규칙은 [`CONTENT_GUIDE.md`](./CONTENT_GUIDE.md). 화이트리스트 등록 절차:

1. 노션에서 **`기록` 페이지 하위**에 페이지 생성. 첫 줄에 한 줄 요약 + H2/H3로 청킹 단위 구조화.
2. 페이지 우측 상단 `...` → Connections → **Portfolio** 추가 (접근 권한)
3. 페이지 ID(URL 마지막 32자) 추출
4. `.env.local`의 해당 환경변수에 ID 추가 (Vercel 환경변수에도 동일 갱신)
5. `npm run sync:notion` 로컬 검증 → `data/portfolio.server.json`에 청크 생성 확인
6. 배포 시 자동 반영

## 자기소개 페이지 메타 (현재 콘텐츠 요약)

`363656db-…` 자기소개 페이지의 H2 섹션 (RAG에서 인용되는 단위):

| H2 헤더 | 본문 요약 | 챗봇 인용 트리거 예시 질문 |
|---|---|---|
| 저는 INTJ 인간이에요 | I/N/T/J 4글자를 본인 단어로 풀이 (일단·노션·따지기·정리) + 취미·습관·위트 | "MBTI 뭐예요?", "어떤 사람이에요?", "취미는?" |
| 요즘 빠져있는 거 | AI에게 일 시키는 법 / 테니스 / 프렌즈 | "요즘 뭐 해요?", "최근 관심사?", "운동은?" |
| 잘 하는 거, 자주 망치는 거 | 👍 배우는 걸 즐김 / 👎 '왜?'를 끝까지 물어 커뮤니케이션 비용 ↑ | "장단점은?", "강점·약점?" |

## 변경 이력

- **2026-06-08**: `기록v2` 분리 정리. Feedback/Contact DB를 프로젝트 DB의 "대화형 포트폴리오" row 하위로 재생성. 이력서 페이지를 워크스페이스 루트 → 기록 하위로 이동. `.env.local`의 Feedback/Contact ID 갱신. 기록v2 하위 자산은 본 문서 범위에서 제외.
- **2026-05-23**: 자기소개 페이지를 `358656db…`(기록v2 하위, 폐기) → `363656db…`(기록 하위) 로 이전. 콘텐츠 자유 포맷 재작성.
- **2026-05-13**: Q&A 피드백 / Contact DB 자동 생성 (초기 위치는 기록v2 하위, 2026-06-08에 이동).
- **초기**: 이력서 + 프로젝트 DB 등록.
