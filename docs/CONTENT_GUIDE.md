# Content Guide (소유자용)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, PRD.md, NOTION_SCHEMA.md, AI_CONTRACT.md
**SSoT keys**: (없음 — 콘텐츠 운영 정책 자체)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

본 문서는 김윤수(소유자)가 노션 콘텐츠를 어떻게 작성/관리하면 사이트 답변 품질이 좋아지는지에 대한 가이드. 사용자가 보는 문서가 아님.

## 한 줄 요약
**페이지 첫 줄에 한 줄 요약, heading으로 구조화, 결과는 숫자로, 외부 링크는 인라인.**

## 어떻게 쓰면 좋은가

### 페이지 시작
- **첫 줄에 한 줄 요약**을 둔다. 이 줄이 답변에 자주 인용된다.
  - 예: `사내 Web3 DeFi 서비스의 모놀리식 프론트엔드를 Micro-Frontend Architecture로 전환하는 TF를 주도했습니다.`
- 그 아래 **"## 프로젝트 개요"** heading 뒤에 2~3줄로 컨텍스트.

### Heading 사용
- H2(`##`)는 큰 주제(개요, 아키텍처, 트러블슈팅, 결과 등).
- H3(`###`)는 하위 패턴/시나리오/문제·원인·해결.
- 청킹은 heading 단위로 일어나므로 한 H2 아래 너무 길지 않게(목표 500-800 토큰).

### 내용
- **결정과 트레이드오프**를 구체적으로 적는다.
  - "Module Federation을 Webpack이 아닌 Vite 기반으로 선택한 이유는 …"
- **수치와 결과**.
  - "HMR 10,600ms → 178ms (59배)"
  - "Load time 30% 개선"
- **사용한 라이브러리/패턴**을 키워드로 나열. tag 처럼 쓰면 검색에 잡힌다.
  - 예: `Module Federation, Vite, Bidirectional Federation, Singleton Shared Dependencies, SIWE, AWS Amplify`
- **외부 참고 링크**는 본문 인라인. 이미지보다 텍스트 우선.

### 무엇을 적지 말까
- 사적인 내용 (가족, 거주지, 정치/종교, 연봉, 회사 내부 비밀).
- 미완료/추측 내용 — 추측은 답변 정확도를 떨어뜨림.
- 회사가 비밀로 하는 정보 — 공개해도 되는 사실만.

## 화이트리스트 추가 (새 페이지를 동기화 대상으로)

1. 노션에서 페이지 작성.
2. URL에서 페이지 ID 복사 (마지막 32자).
3. `.env.local`의 `NOTION_PROFILE_PAGE_IDS`에 콤마로 추가.
4. `npm run sync:notion` (로컬) 또는 다음 배포 → 자동 반영.

## 새 카테고리 추가 (예: 취미)

1. 노션에 "취미" 페이지 생성. heading 단위로 정리.
2. `NOTION_PROFILE_PAGE_IDS`에 추가.
3. 다음 빌드시 `scripts/generate-suggestions.ts`가 자동으로 `"취미가 뭐예요?"` 추천 질문 추가.

## Q&A 피드백 운영 워크플로우

방문자가 답변에 👎를 남기면 노션 "Q&A 피드백" DB에 row가 자동 추가된다.

1. 노션 DB 열기 → Status="새" 필터.
2. Question + Answer + Reason + RetrievalChunks 보고:
   - **정보가 정확하지 않아요** → 해당 노션 페이지를 정정.
   - **내가 원한 답이 아니에요** → 질문 의도가 다른 경우. 컨텍스트 부족이면 페이지 보강.
   - **관련 내용이 부족해요** → 새 heading/페이지 추가.
3. Status="보강중"으로 변경.
4. 노션 페이지 보강 완료 후 Status="보강완료".
5. 다음 빌드(자동/수동) 시 사이트에 반영.

→ 모바일 노션 알림을 켜두면 거의 실시간 인지 가능.

## Contact 운영 워크플로우

방문자가 Contact 폼을 제출하면 노션 "Contact" DB에 row가 추가되고, `RESEND_API_KEY` 설정 시 메일 알림이 온다.

1. 노션 Contact DB 열기 → Status="새".
2. 회신은 Email 컬럼의 주소로 직접 보낸다(노션은 발송 불가).
3. 회신 후 Status="회신중" → "회신완료".

## 콘텐츠 변경 → 사이트 반영 흐름

```
노션 수정
  ↓
(자동) GitHub Action 매일 1회 재빌드 또는 (수동) Vercel Redeploy
  ↓
prebuild가 sync:notion 실행
  ↓
data/portfolio.server.json + public/data/suggestions.json 갱신
  ↓
배포 → 사이트 반영
```

수동 즉시 반영: Vercel Dashboard → Redeploy.

## 자주 하는 실수

| 실수 | 결과 | 권장 |
|---|---|---|
| 페이지 첫 줄을 비워두고 H2부터 시작 | 페이지 요약이 약해 답변 품질 저하 | 첫 줄에 한 줄 요약 |
| 모든 내용을 한 H2 아래에 길게 | 청크 1개로 묶여 검색 부정확 | H2/H3로 분리 |
| 비공개 페이지에 NOTION_PROFILE_PAGE_IDS 추가 | 빌드시 권한 오류 | 페이지 우측 상단 "공유" → 봇에 view 권한 |
| 결과 수치를 "많이 개선" 같이 정성적으로 | 답변에 신뢰감 ↓ | 구체 수치 |
| 사적 내용 추가 | 답변에 노출되어 곤란 | 화이트리스트에서 제외 |

## 봇 권한 (Notion Integration)

1. https://www.notion.so/my-integrations 에서 Internal Integration 생성.
2. token을 `NOTION_TOKEN`에 등록.
3. 동기화하려는 모든 페이지/DB를 봇에 공유 (Share → Add connection).
