# Notion Workspace Structure

> 이 문서는 본 포트폴리오와 동기화되는 노션 워크스페이스의 **실제 페이지 위치와 역할**을 정리한다.
> 데이터 스키마·zod 정의는 [`NOTION_SCHEMA.md`](./NOTION_SCHEMA.md), 콘텐츠 작성 가이드는 [`CONTENT_GUIDE.md`](./CONTENT_GUIDE.md) 참조.

## 워크스페이스 메타

| 항목 | 값 |
|---|---|
| 워크스페이스 이름 | **Kiri CO.** |
| Notion Integration | **Portfolio** (Internal Integration, bot user) |
| Integration 토큰 환경변수 | `NOTION_TOKEN` |
| 접근 권한 부여 방식 | 각 페이지·DB 우측 상단 `...` → Connections → `Portfolio` 추가 |

## 페이지 트리 (현재 상태)

```
Kiri CO. (workspace)
├── 김윤수 이력서                  (0d23b37e-f6bb-42a2-acf8-5b33be3ea98a)   📥 sync
│
├── 기록                            (aa07726c-a535-4985-8b41-7123b06e235d)   ← 사용자 메인 작업 공간
│   ├── 자기소개                    (363656db-6947-80d0-9c9c-eca1d37c2ba1)   📥 sync
│   ├── 프로젝트 (DB)               (45b65a79-1ab6-4ab3-aba8-72a84c3ca655)   📥 sync
│   ├── 스터디 (DB)                 (f9ef6e77-e3a0-4b50-9296-810d844c865c)   ⛔ skip
│   └── Before optimizing bundle…   (318656db-6947-80a9-b0f9-c0bf5acfa89d)   ⛔ skip (단일 기술 글)
│
└── 📖 기록v2                       (33a656db-6947-810d-9068-fc90368ad03c)   ← 이전 메인, 일부 기능 분산
    ├── 🏠 홈                       (33a656db-6947-8160-bdc6-c60df36e0f95)   ⛔ skip
    ├── 📦 구 기록 (아카이브)        (33a656db-6947-819e-99cf-ec16e433c6f0)   ⛔ skip
    ├── 📚 학습 노트 (DB)            (9c3a91f0-9157-49ae-a34c-dee78c04d1c4)   ⛔ blocklist (개인 메모)
    ├── 자기소개  ⚠️ DEPRECATED      (358656db-6947-812c-b2d1-e6afcbbd5bd3)   ⛔ 폐기 (사용자 접근 불가, 콘텐츠는 위 자기소개로 이전)
    ├── Q&A 피드백 (DB)              (361656db-6947-81ce-b370-f1fbb17a8da7)   ✏️ write (사용자 피드백 적재)
    └── Contact (DB)                 (361656db-6947-8161-b690-f03aa9aaa873)   ✏️ write (Contact 폼 적재)
```

## 페이지별 역할 표

### 동기화 대상 (`sync-notion.ts`가 읽어가는 페이지)

| 페이지 / DB | ID | 환경변수 | 카테고리 매핑 | 역할 |
|---|---|---|---|---|
| **김윤수 이력서** | `0d23b37e-…` | `NOTION_PROFILE_PAGE_IDS` | `career` (`scripts/sync-notion.ts:91`) | 직무·연차·헤드라인·이력 추출 + 청크 임베딩. `/about` 인트로 + 챗봇 RAG. |
| **자기소개** (기록 하위) | `363656db-…` | `NOTION_PROFILE_PAGE_IDS` | `personal` (`scripts/sync-notion.ts:92`) | 인성·MBTI·취미·장단점. H2 단위 청크. `/about` 섹션 + 챗봇 RAG. |
| **프로젝트 DB** | `45b65a79-…` | `NOTION_PROJECTS_DB_ID` | `project` (`scripts/sync-notion.ts:95`) | 카테고리=`자체프로젝트`/`업무`/`외부활동` + 상태=`Done`/`In progress`만 동기화. `/experience` 카드 + 챗봇 RAG. |

### 쓰기 대상 (사용자 입력이 노션 DB로 적재)

| DB | ID | 환경변수 | 적재 트리거 | 적재 컬럼 |
|---|---|---|---|---|
| **Q&A 피드백** | `361656db-…81ce` | `NOTION_FEEDBACK_DB_ID` | 챗봇 답변에 👎 + Reason 선택 시 `/api/feedback` | Question / Answer / Reason / Model / RetrievalChunks / Status / UA hash. 스키마는 [`NOTION_SCHEMA.md`](./NOTION_SCHEMA.md) L43~58. |
| **Contact** | `361656db-…8161` | `NOTION_CONTACT_DB_ID` | Contact 폼 제출 시 `/api/contact` | Title / Email / Message / Status / UA hash. 스키마는 [`NOTION_SCHEMA.md`](./NOTION_SCHEMA.md) L60~71. |

### 동기화 제외 (skip / blocklist)

| 페이지 / DB | ID | 이유 |
|---|---|---|
| 스터디 DB | `f9ef6e77-…` | 개인 학습 노트성. RAG 컨텍스트로 부적합. |
| Before optimizing bundle size + 핫리로드 | `318656db-…` | 단일 기술 글. 동기화 대상 등록 안 됨. |
| 🏠 홈 (기록v2) | `33a656db-…8160` | 노션 내비게이션용. |
| 📦 구 기록 (아카이브) | `33a656db-…819e` | 아카이브. |
| 📚 학습 노트 DB | `9c3a91f0-…` | 개인 메모. 인용 시 부정확성 위험. |
| ⚠️ 자기소개 (기록v2 하위) | `358656db-…` | **폐기**. 사용자 접근 불가 위치에 있었음. 콘텐츠는 기록 하위의 자기소개로 이전 완료. `NOTION_PROFILE_PAGE_IDS`에서 제외. |

## 환경변수 빠른 참조

`.env.local`(git 미커밋, 로컬·Vercel만 보관):

```
NOTION_TOKEN=ntn_...                                    # Portfolio integration
NOTION_PROJECTS_DB_ID=45b65a79-1ab6-4ab3-aba8-72a84c3ca655
NOTION_PROFILE_PAGE_IDS=0d23b37e-f6bb-42a2-acf8-5b33be3ea98a,363656db-6947-80d0-9c9c-eca1d37c2ba1
NOTION_FEEDBACK_DB_ID=361656db-6947-81ce-b370-f1fbb17a8da7
NOTION_CONTACT_DB_ID=361656db-6947-8161-b690-f03aa9aaa873
```

## 카테고리 매핑 로직 요약

`scripts/sync-notion.ts:88` `resolveCategory()`:

1. **페이지 ID가 `NOTION_PROFILE_PAGE_IDS`에 있을 때**
   - 페이지 제목에 `"이력서"` 또는 `"resume"` 포함 → `career`
   - 그 외 → `personal`
2. **프로젝트 DB row일 때**
   - 카테고리 = `자체프로젝트` / `업무` / `외부활동` → `project`
3. **그 외** → `subpage` (참고 청크)

## 새 페이지 추가 시 절차

콘텐츠 작성 규칙은 [`CONTENT_GUIDE.md`](./CONTENT_GUIDE.md). 화이트리스트 등록 절차:

1. 노션에서 페이지 생성 + 첫 줄에 한 줄 요약 + H2/H3로 청킹 단위 구조화
2. 페이지 우측 상단 `...` → Connections → **Portfolio** 추가 (접근 권한)
3. 페이지 ID(URL 마지막 32자) 추출
4. `.env.local`의 `NOTION_PROFILE_PAGE_IDS`에 콤마로 추가 (Vercel 환경변수에도 동일 갱신)
5. `npm run sync:notion` 로컬 검증 → `data/portfolio.server.json`에 personal/career 청크 생성 확인
6. 배포 시 자동 반영

## 자기소개 페이지 메타 (현재 콘텐츠 요약)

`363656db-…` 자기소개 페이지에 들어 있는 H2 섹션 (RAG에서 인용되는 단위):

| H2 헤더 | 본문 요약 | 챗봇 인용 트리거 예시 질문 |
|---|---|---|
| 저는 INTJ 인간이에요 | I/N/T/J 4글자를 본인 단어로 풀이 (일단·노션·따지기·정리) + 취미·습관·위트 | "MBTI 뭐예요?", "어떤 사람이에요?", "취미는?" |
| 요즘 빠져있는 거 | AI에게 일 시키는 법 / 테니스 / 프렌즈 | "요즘 뭐 해요?", "최근 관심사?", "운동은?" |
| 잘 하는 거, 자주 망치는 거 | 👍 배우는 걸 즐김 / 👎 '왜?'를 끝까지 물어 커뮤니케이션 비용 ↑ | "장단점은?", "강점·약점?" |

## 변경 이력

- **2026-05-23**: 자기소개 페이지를 `358656db…`(기록v2 하위, 폐기) → `363656db…`(기록 하위) 로 이전. 콘텐츠 자유 포맷 재작성. `.env.local` 갱신.
- **2026-05-13**: Q&A 피드백 / Contact DB 자동 생성 (기록v2 하위).
- **초기**: 김윤수 이력서 + 프로젝트 DB 등록.
