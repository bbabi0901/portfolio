# Step 4: sync-notion

## 읽어야 할 파일

- `/CLAUDE.md` — `data/portfolio.server.json` 서버 전용, `data/portfolio.sample.json`만 커밋
- `/docs/NOTION_SCHEMA.md` — 화이트리스트, portfolio.server.json 출력 schema
- `/docs/ARCHITECTURE.md` — 빌드시 동기화 데이터 흐름
- `/docs/ADR.md` — ADR-005 노션 단일 소스, ADR-009 stateless
- `/docs/CONTENT_GUIDE.md` — 소유자가 노션을 어떻게 쓰는지 (카테고리, heading 정책)
- `/.env.local.example` — `NOTION_TOKEN`, `NOTION_PROJECTS_DB_ID`, `NOTION_PROFILE_PAGE_IDS`, `MOCK_NOTION`, `MOCK_LLM`, `SKIP_NOTION_SYNC`
- `/spec.json` — `suggestedQuestions[]` (이 step은 chunks만, 추천 질문 정적은 step 6)

이전 step 산출물:

- `/services/notion.ts` — `createNotionService`, `queryDatabase`, `getPagesContent`
- `/services/openai-embeddings.ts` — `createEmbeddingsService`, `embedBatch`
- `/lib/chunking.ts` — `chunkPages`
- `/lib/tokenize.ts`, `/lib/embeddings.ts`
- `/types/portfolio.ts` — `PortfolioServerData`, `PortfolioChunk`
- `/.gitignore` — `data/portfolio.server.json`, `public/data/suggestions.json` 무시 + `!data/portfolio.sample.json` 예외

위 파일들을 읽고 통합. 특히 `services/notion.ts`의 `createNotionService` 시그니처와 `lib/chunking.ts`의 `chunkPages` 시그니처가 정확히 일치하는지 확인.

## 작업

빌드 스크립트 `scripts/sync-notion.ts`. notion → markdown → chunks → embeddings → `data/portfolio.server.json`.

### 환경변수 정책

이 스크립트는 다음 환경변수를 읽는다 (`process.env`):
- `NOTION_TOKEN` — 미설정 + `MOCK_NOTION!=1` → exit 1 with 친절 에러.
- `NOTION_PROJECTS_DB_ID` — 미설정 + `MOCK_NOTION!=1` → exit 1.
- `NOTION_PROFILE_PAGE_IDS` — 콤마 구분, 옵션 (없으면 프로젝트 DB만).
- `OPENAI_API_KEY` — 미설정 + `MOCK_LLM!=1` → exit 1.
- `MOCK_NOTION=1` → fixture 사용 (sample 출력만).
- `MOCK_LLM=1` → fixture embedding 사용 (실제 OpenAI 호출 안 함).
- `SKIP_NOTION_SYNC=1` → 스크립트 시작 즉시 exit 0 + "skipped" 메시지.

### 생성/수정할 파일

#### `scripts/sync-notion.ts`

```ts
import "server-only";  // 빌드 스크립트에서도 가드. tsx로 실행되므로 무시 가능 — 옵션.

import fs from "node:fs";
import path from "node:path";

import { createNotionService } from "@/services/notion";
import { createEmbeddingsService } from "@/services/openai-embeddings";
import { chunkPages } from "@/lib/chunking";
import type { PortfolioServerData, ChunkCategory } from "@/types/portfolio";

interface SyncOptions {
  outDir?: string;                 // default "data"
  serverFileName?: string;         // default "portfolio.server.json"
  sampleFileName?: string;         // default "portfolio.sample.json"
  /**
   * fixture 모드: NOTION/LLM 모두 mock. sample만 갱신.
   */
  fixtureOnly?: boolean;
}

async function main(opts?: SyncOptions): Promise<void> { /* ... */ }

main().catch((err) => {
  console.error("[sync-notion] failed:", err.message);
  process.exit(1);
});
```

플로우:
1. `SKIP_NOTION_SYNC=1` → exit 0.
2. 환경변수 검증 (zod).
3. `MOCK_NOTION=1`이면 fixture 모드 활성, 아니면 실제 노션. 동일하게 `MOCK_LLM=1`로 임베딩 fixture.
4. NotionService → `queryDatabase(projectsDbId)` → ProjectRefs.
5. `NOTION_PROFILE_PAGE_IDS` → `getPageRef` 각각 → ProfileRefs.
6. 모든 ref → `getPagesContent` 병렬 fetch (concurrency 4) → markdown.
7. `chunkPages(pages, categoryResolver)` → `PortfolioChunk[]` (embedding은 빈 배열).
8. EmbeddingsService → `embedBatch(chunks.map(c => c.text))` → embeddings.
9. chunks에 embedding 부착.
10. `PortfolioServerData` 객체 생성:
    - `version`: package.json 버전 또는 hardcode (예: "0.1.0").
    - `generatedAt`: ISO 8601 + KST offset (`+09:00`).
    - `chunks`: 위 결과.
    - `suggestedQuestions`: spec.json `suggestedQuestions[]` 그대로 복사.
    - `profile`: 이력서 페이지 + 노션 메타에서 추출 (이메일, github 등). 없는 필드는 spec/CLAUDE.md 기본값.
11. `data/portfolio.server.json` 쓰기 (jsonStringify pretty 2 indent).
12. `data/portfolio.sample.json` 갱신 — chunks를 5~10개로 다운샘플 + embedding 차원을 16d 임의로 절단(파일 사이즈 절감) + suggestedQuestions 그대로 + profile 그대로. 이는 fallback 용. **sample은 항상 갱신** (fixtureOnly 모드여도).
13. 통계 출력: `✓ ${chunks.length} chunks, ${pages.length} pages, ${suggestedQuestions.length} questions, generatedAt ...`.

#### `data/portfolio.sample.json` (커밋)

스크립트 첫 실행 후 생성됨. 또는 이 step에서 직접 손으로 만들 수도 있지만 fixture 모드 한 번 돌리는 편이 일관성 있음.

#### `package.json` scripts 갱신

```json
{
  "scripts": {
    "sync:notion": "tsx scripts/sync-notion.ts",
    "prebuild": "npm run check:spec && npm run sync:notion"
  }
}
```

**주의**: prebuild에 sync:notion 추가하지만, CI에서는 `SKIP_NOTION_SYNC=1`로 우회 (이미 `0-scaffold/step6`의 `.github/workflows/ci.yml`에 환경변수 설정됨). 로컬에서 `npm run build` 시 토큰 미설정이면 sync가 실패하는데, 이는 의도된 동작 (운영자 빌드는 토큰 필수).

다만 fixture 모드가 있으면 `MOCK_NOTION=1 MOCK_LLM=1 npm run build`로도 통과. CI는 SKIP으로 sync 자체를 건너뜀.

#### `specs/sync-notion.spec.ts`

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("sync-notion script", () => {
  let tmpDir: string;
  const env = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...env };
  });

  it("exits 0 when SKIP_NOTION_SYNC=1", async () => {
    process.env.SKIP_NOTION_SYNC = "1";
    // 스크립트 main()을 import하여 호출. 또는 child_process로 실행.
    // 추천: main()을 export하여 직접 호출 + outDir=tmpDir.
    const { main } = await import("@/scripts/sync-notion");
    await main({ outDir: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "portfolio.server.json"))).toBe(false);
  });

  it("writes portfolio.server.json with chunks/embeddings in mock mode", async () => {
    process.env.MOCK_NOTION = "1";
    process.env.MOCK_LLM = "1";
    process.env.NOTION_TOKEN = "fake";
    process.env.NOTION_PROJECTS_DB_ID = "fake-db";
    process.env.OPENAI_API_KEY = "fake";
    process.env.SKIP_NOTION_SYNC = "";
    const { main } = await import("@/scripts/sync-notion");
    await main({ outDir: tmpDir });
    const filePath = path.join(tmpDir, "portfolio.server.json");
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.chunks.length).toBeGreaterThan(0);
    expect(data.chunks[0].embedding).toHaveLength(1536);
    expect(data.generatedAt).toMatch(/\+09:00/);
    expect(data.suggestedQuestions).toBeDefined();
  });

  it("also writes sample.json in mock mode", async () => {
    /* 동일 setup */
    /* sample 파일 존재 + chunks 5-10 다운샘플 검증 */
  });

  it("fails when token missing and not mock", async () => {
    process.env.MOCK_NOTION = "";
    process.env.NOTION_TOKEN = "";
    const { main } = await import("@/scripts/sync-notion");
    await expect(main({ outDir: tmpDir })).rejects.toThrow();
  });
});
```

**주의**: `process.env`를 mock하는 테스트는 vitest의 `vi.stubEnv` 사용 권장. 여기서는 명시적 reset.

### 핵심 규칙

- 빌드 결정성: 같은 노션 상태 + 같은 spec.json → 같은 portfolio.server.json (단 `generatedAt`만 다름).
- `generatedAt`: ISO + KST offset `+09:00`.
- chunks 정렬: deterministic order (sourcePageId → headingPath).
- `data/portfolio.sample.json`은 항상 갱신 (커밋 가능).
- `SKIP_NOTION_SYNC=1` 시 즉시 exit 0.
- 권한 없는 페이지 skip + warning 로그. 빌드는 성공.
- 노션 5xx → exit 1 (빌드 차단). 4xx 일부 (403 한 페이지) → skip.

## Acceptance Criteria

```bash
# Mock 모드 통과
MOCK_NOTION=1 MOCK_LLM=1 NOTION_TOKEN=fake NOTION_PROJECTS_DB_ID=fake \
  OPENAI_API_KEY=fake npm run sync:notion

# 산출물 검증
test -f data/portfolio.server.json
test -f data/portfolio.sample.json
node -e "
const d = JSON.parse(require('fs').readFileSync('data/portfolio.server.json'));
if (d.chunks.length === 0) process.exit(1);
if (d.chunks[0].embedding.length !== 1536) process.exit(1);
if (!d.generatedAt.includes('+09:00')) process.exit(1);
console.log('OK', d.chunks.length, 'chunks');
"

# SKIP 모드
rm -f data/portfolio.server.json
SKIP_NOTION_SYNC=1 npm run sync:notion
test ! -f data/portfolio.server.json   # 변경 없음

# 단위 테스트
npm run test
npx tsc --noEmit
npm run lint
npm run build  # SKIP_NOTION_SYNC=1 또는 MOCK_*=1 환경에서 prebuild 통과
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - portfolio.server.json 형식이 PortfolioServerData 타입과 일치?
   - chunks의 embedding 1536d?
   - generatedAt KST offset?
   - sample.json은 chunks 다운샘플 + 작은 차원?
   - SKIP_NOTION_SYNC 즉시 exit?
   - 토큰 누락 시 명확한 에러?
3. `phases/1-content-pipeline/index.json` step 4 갱신.

## 금지사항

- **`data/portfolio.server.json`을 git에 커밋 금지.** 이유: CLAUDE.md, .gitignore에 이미 추가됨.
- **`data/portfolio.sample.json`에 실제 NOTION_TOKEN, 실제 비공개 콘텐츠 포함 금지.** 이유: 공개 가능 sample.
- **`data/` 외 위치에 출력 금지.** 이유: 단일 위치 + .gitignore 일관성.
- **노션 응답을 캐시(예: .cache/)하기 금지** (이 step). 이유: 캐시 무효화 복잡도. 후속 task의 incremental sync로 미룸.
- **chunks 정렬 무작위 금지.** 이유: 결정성.
- **외부 imageUrl, attachment 다운로드 금지.** 이유: 사이드이펙트 + 디스크 누적.
- **`@ai-sdk/openai` 의존성 추가 금지** (이 step). 이유: step 3 정책. 이 step은 services/openai-embeddings의 fetch만.
- **client component에서 import 금지.** 이유: 토큰 누출.
- **`process.exit(0)` 외 비정상 exit code 사용 금지.** 이유: CI 신호 명확성. 실패는 throw + main().catch.
- **prebuild에서 sync:notion이 실패해도 빌드를 계속 진행하게 만들기 금지** (`|| true`). 이유: 빌드 결정성 보장.
