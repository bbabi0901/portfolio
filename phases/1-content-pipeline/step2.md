# Step 2: notion-service

## 읽어야 할 파일

- `/CLAUDE.md` — Notion API 호출은 Hono 라우트 또는 빌드 스크립트에서만, NOTION_TOKEN 클라이언트 노출 금지
- `/docs/NOTION_SCHEMA.md` — 화이트리스트 (NOTION_PROJECTS_DB_ID, NOTION_PROFILE_PAGE_IDS), 차단 페이지, Q&A 피드백/Contact DB 스키마는 후속
- `/docs/ARCHITECTURE.md` — `services/` 위치 + 외부 API 래퍼 정책
- `/docs/ADR.md` — ADR-005 노션 단일 소스
- `/.env.local.example` — `NOTION_TOKEN`, `NOTION_PROJECTS_DB_ID`, `NOTION_PROFILE_PAGE_IDS`, `MOCK_NOTION` 등

이전 step 산출물:

- `/types/notion.ts` — `NotionPageRef`, `NotionPageContent`
- `/types/portfolio.ts` — `ChunkCategory`
- `/lib/chunking.ts` — chunk 생성 (이 step에서는 호출하지 않음, sync-notion에서 통합)
- `/tests/msw/handlers.ts` — 빈 배열, 이 step에서 Notion handler 추가

`types/notion.ts`의 `NotionPageRef` 필드를 정확히 매핑할 수 있도록 `@notionhq/client` 응답 구조를 미리 검토하라.

## 작업

`@notionhq/client` + `notion-to-md`를 감싸는 `services/notion.ts`. Notion API 응답을 `NotionPageRef` / `NotionPageContent`로 정규화. **빌드 스크립트와 Node-runtime 라우트에서만 호출.** Edge runtime에서는 import 금지.

### 의존성 추가 (`package.json`)

- `@notionhq/client@^5`
- `notion-to-md@^3`

### 생성/수정할 파일

#### `services/notion.ts` (Node-only)

```ts
import "server-only";  // 클라이언트 번들 누출 방지

import type { NotionPageRef, NotionPageContent } from "@/types/notion";

export interface NotionServiceOptions {
  token: string;                    // NOTION_TOKEN
  /**
   * MOCK 모드: 실제 API 대신 fixture 사용. fixture 디렉토리는 옵션.
   * MOCK_NOTION=1 환경변수와 일치.
   */
  mock?: boolean;
  /** mock=true일 때 fixture 위치 */
  fixtureDir?: string;
  /** 호출 간 backoff (ms). API rate limit 회피. */
  rateLimitBackoffMs?: number;
}

export interface NotionService {
  /**
   * DB 쿼리 → 모든 페이지 ref 목록.
   * 페이지네이션 자동 처리 (cursor).
   */
  queryDatabase(databaseId: string, opts?: { categoryFilter?: string[] }): Promise<NotionPageRef[]>;

  /**
   * 페이지 1건 → ref 메타.
   * 비공개 페이지면 isPublic=false. 권한 없는 페이지면 null.
   */
  getPageRef(pageId: string): Promise<NotionPageRef | null>;

  /**
   * 페이지 1건 → markdown 변환 (notion-to-md).
   * front-matter 제거, 이미지 alt 보존.
   */
  getPageContent(pageId: string): Promise<NotionPageContent | null>;

  /**
   * 여러 페이지를 병렬 fetch (concurrency 제한 4).
   * 권한 없는 페이지는 skip + onSkip 콜백.
   */
  getPagesContent(
    pageIds: string[],
    opts?: { concurrency?: number; onSkip?: (id: string, reason: string) => void }
  ): Promise<NotionPageContent[]>;
}

export function createNotionService(options: NotionServiceOptions): NotionService;
```

핵심 규칙:
- **`"server-only"` import 첫 줄 강제.** Edge/클라이언트 번들 차단.
- **NOTION_TOKEN을 함수 인자로 받음.** `process.env.NOTION_TOKEN` 직접 접근 금지 (테스트 용이성).
- **rate limit 4xx/429:** exponential backoff 4회 재시도 (250ms → 500 → 1000 → 2000), 모두 실패 시 throw.
- **권한 에러(401/403):** 해당 페이지만 skip + onSkip 콜백, 다른 페이지는 계속.
- **MOCK 모드:** `mock=true`이면 fixture 디렉토리(`tests/fixtures/notion/`)에서 JSON 읽음. fixture 미존재 시 throw.
- **응답 정규화:** Notion DB 속성명(다국어 한글/영문) → 우리 도메인 필드 매핑 테이블 노출. (예: "이름"/"Name" → title, "기간"/"Period" → period.)

#### `tests/fixtures/notion/` (테스트 fixture)

이 step에서 다음 fixture들을 생성:

1. `tests/fixtures/notion/db-projects.json`:
   ```json
   {
     "results": [
       {
         "id": "fixture-page-1",
         "url": "https://www.notion.so/fixture-page-1",
         "properties": {
           "이름": { "type": "title", "title": [{ "plain_text": "Sample Project" }] },
           "카테고리": { "type": "select", "select": { "name": "업무" } },
           "상태": { "type": "status", "status": { "name": "Done" } },
           "기간": { "type": "rich_text", "rich_text": [{ "plain_text": "2025.11–12" }] }
         }
       }
     ]
   }
   ```

2. `tests/fixtures/notion/page-fixture-page-1.md`: 노션 페이지 마크다운 변환 결과.
   ```markdown
   ## 개요
   샘플 프로젝트 설명.

   ## 기술 스택
   - Next.js
   - TypeScript
   ```

3. `tests/fixtures/notion/page-fixture-resume.md`: 이력서 페이지 fixture.

#### `tests/msw/handlers.ts` 갱신

```ts
import { http, HttpResponse } from "msw";

const NOTION_BASE = "https://api.notion.com";

export const notionHandlers = [
  http.post(`${NOTION_BASE}/v1/databases/:databaseId/query`, () =>
    HttpResponse.json({ results: [], next_cursor: null, has_more: false })
  ),
  http.get(`${NOTION_BASE}/v1/pages/:pageId`, () =>
    HttpResponse.json({ id: "test-page", properties: {} })
  ),
  http.get(`${NOTION_BASE}/v1/blocks/:blockId/children`, () =>
    HttpResponse.json({ results: [], next_cursor: null, has_more: false })
  ),
];

export const handlers = [...notionHandlers];
```

#### `specs/notion-service.spec.ts` (TDD)

```ts
import { describe, it, expect } from "vitest";
import { createNotionService } from "@/services/notion";

describe("NotionService", () => {
  describe("MOCK mode", () => {
    const svc = createNotionService({
      token: "fake",
      mock: true,
      fixtureDir: "tests/fixtures/notion",
    });

    it("queryDatabase returns ref list from fixture", async () => {
      const refs = await svc.queryDatabase("fixture-db");
      expect(refs.length).toBeGreaterThan(0);
      expect(refs[0].id).toBe("fixture-page-1");
      expect(refs[0].title).toBe("Sample Project");
      expect(refs[0].category).toBe("업무");
      expect(refs[0].status).toBe("Done");
      expect(refs[0].period).toBe("2025.11–12");
    });

    it("getPageContent returns markdown from fixture", async () => {
      const content = await svc.getPageContent("fixture-page-1");
      expect(content).not.toBeNull();
      expect(content!.markdown).toContain("## 개요");
    });

    it("returns null for missing fixture", async () => {
      const content = await svc.getPageContent("nonexistent");
      expect(content).toBeNull();
    });

    it("getPagesContent skips missing with onSkip callback", async () => {
      const skipped: string[] = [];
      const contents = await svc.getPagesContent(["fixture-page-1", "missing"], {
        onSkip: (id) => skipped.push(id),
      });
      expect(contents).toHaveLength(1);
      expect(skipped).toContain("missing");
    });
  });

  describe("non-MOCK mode (msw mocked Notion API)", () => {
    const svc = createNotionService({ token: "fake", mock: false });

    it("queryDatabase paginates", async () => {
      const refs = await svc.queryDatabase("any-db");
      expect(Array.isArray(refs)).toBe(true);
    });
  });

  describe("error handling", () => {
    it("throws when token missing", () => {
      expect(() => createNotionService({ token: "" })).toThrow();
    });
  });
});
```

### TDD 순서

1. fixture JSON/MD 파일 생성.
2. `tests/msw/handlers.ts` Notion handler 추가.
3. `specs/notion-service.spec.ts` 작성 → 실패.
4. `services/notion.ts` 작성 → 통과.
5. lint/tsc/build 통과.

### 핵심 규칙

- `"server-only"` import 강제.
- `NOTION_TOKEN` 옵션으로만 받음 (`process.env` 직접 참조 금지).
- 비공개/권한 없음 페이지는 skip (throw 아님).
- 4xx/429 backoff 재시도. 5xx 즉시 throw (재시도 안 함, 상위에서 처리).
- 노션 DB 속성명은 한글/영문 둘 다 호환.

## Acceptance Criteria

```bash
npm install                                  # @notionhq/client + notion-to-md 설치
npm run test                                 # spec 통과 (msw + fixture)
npx tsc --noEmit
npm run lint
npm run build

test -f services/notion.ts
test -f specs/notion-service.spec.ts
test -f tests/fixtures/notion/db-projects.json
test -f tests/fixtures/notion/page-fixture-page-1.md
grep -q '"server-only"' services/notion.ts

# 클라이언트 번들 누출 검사 (services/notion이 client 진입로에서 import되면 next build가 fail)
npm run build  # 통과 == 누출 없음
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - `services/notion.ts` 첫 줄 `import "server-only"`?
   - `process.env.NOTION_TOKEN` 직접 참조 grep 0건?
   - MOCK 모드와 실 API 모드 모두 테스트 통과?
   - 4xx 재시도 + 5xx 즉시 throw?
3. `phases/1-content-pipeline/index.json` step 2 갱신.

## 금지사항

- **`process.env.NOTION_TOKEN` 직접 참조 금지.** 이유: 테스트 용이성 + 환경변수 wrap은 후속 task의 lib/env.ts에서.
- **client component (`"use client"`)에서 services/notion import 금지.** 이유: 토큰 누출. server-only import로 강제 차단.
- **`tests/fixtures/notion/` 외 위치에 fixture 두기 금지.** 이유: 일관성.
- **fixture에 실제 NOTION_TOKEN, 실제 page ID 사용 금지.** 이유: 보안.
- **chunking 호출 금지.** 이유: 다음 step(sync-notion)에서 통합.
- **임베딩 호출 금지.** 이유: 다음 step(embeddings-service).
- **`portfolio.server.json` I/O 금지.** 이유: 다음 step(sync-notion).
- **5xx 무한 재시도 금지.** 이유: 빌드 무한 hang.
- **rate limit 회피 위해 무제한 concurrency 금지.** 이유: 429 폭주. 기본 concurrency=4.
