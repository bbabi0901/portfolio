# Step 1: chunking

## 읽어야 할 파일

- `/docs/NOTION_SCHEMA.md` — 청킹 규칙 (heading 단위, 500-800 토큰 목표, 코드블록 분할 금지, 페이지당 최대 30 청크)
- `/docs/ARCHITECTURE.md` — `lib/chunking.ts` 위치
- `/CLAUDE.md` — `lib/` 도메인 로직 위치

이전 step 산출물:

- `/types/portfolio.ts` — `PortfolioChunk` 타입 (id/sourcePageId/sourceTitle/sourceUrl/category/headingPath/text/tokens/embedding/tags)
- `/types/notion.ts` — `NotionPageRef`, `NotionPageContent` 타입
- `/lib/tokenize.ts` — `tokenize`, `estimateTokens`, `extractKeywords`
- `/lib/embeddings.ts` — `fixtureEmbedding`

`PortfolioChunk` 구조와 `estimateTokens`/`extractKeywords` 시그니처 확인 후 그것을 사용한다.

## 작업

마크다운(notion-to-md 출력) → `PortfolioChunk[]` 변환 로직. **임베딩은 이 step에서 채우지 않음** (다음 step에서 외부 API로). 이 step은 청크 분할 + 메타 + tags 추출까지.

### 생성할 파일

#### `lib/chunking.ts`

```ts
import type { ChunkCategory, PortfolioChunk } from "@/types/portfolio";
import type { NotionPageContent } from "@/types/notion";

export interface ChunkOptions {
  /** 청크 1개의 목표 토큰 수 (default 600) */
  targetTokens?: number;
  /** 청크 1개의 상한 토큰 수. 단일 heading이 이를 초과해도 분할하지 않음 (코드블록 보호) (default 1200) */
  maxTokens?: number;
  /** 페이지당 청크 상한 (default 30). 초과 시 후반 컷 + 경고 콜백 */
  maxChunksPerPage?: number;
  /** 너무 짧은 청크는 직전 청크에 머지 (default 150) */
  mergeBelowTokens?: number;
  /** 비결정적 hash 사용 회피 (deterministic id 생성) */
  idStrategy?: "stable-hash";
  /** 경고 핸들러 — 30 청크 초과, 코드블록 너무 김 등 */
  onWarn?: (message: string) => void;
}

/**
 * 마크다운을 heading 단위로 분할 + 메타 부착.
 * - heading 변경(# → ##) 시 새 청크 시작.
 * - 코드블록(``` ... ```)은 분할 금지: 한 청크에 통째로.
 * - 짧은 청크(< mergeBelowTokens) → 직전 청크와 머지.
 * - 긴 단일 청크가 maxTokens 초과 → 분할하지 않고 onWarn 호출 + 그대로 통과.
 *
 * 반환 chunk의 embedding은 빈 배열 [].
 * tags는 extractKeywords로 자동 채움 (top-5).
 * id는 sourcePageId + headingPath join의 stable hash.
 */
export function chunkMarkdown(
  page: NotionPageContent,
  category: ChunkCategory,
  options?: ChunkOptions
): PortfolioChunk[];

/**
 * 여러 페이지를 일괄 청킹 + 페이지당 한도 적용.
 */
export function chunkPages(
  pages: NotionPageContent[],
  categoryResolver: (page: NotionPageContent) => ChunkCategory,
  options?: ChunkOptions
): PortfolioChunk[];

/**
 * Stable hash. 같은 입력 → 같은 출력. crypto.subtle 또는 단순 fnv-1a.
 * Edge 호환을 위해 Node `crypto`는 사용 금지 → 직접 fnv-1a 32-bit 구현.
 */
export function stableHash(input: string): string;
```

### 핵심 규칙

- **코드블록 절대 분할 금지.** triple-backtick(```)으로 둘러싸인 영역은 한 청크에. 청크 내부에서 토큰이 넘쳐도 OK.
- **이미지 alt 사용:** 마크다운 이미지(`![alt](url)`)는 alt만 텍스트로 보존, URL은 별도 필드 없이 본문에 그대로.
- **헤딩 path 유지:** `headingPath`는 H1→H2→H3 트레일.
- **id deterministic:** 같은 페이지 + 같은 heading sequence → 같은 id. `Date.now()`, `Math.random()` 사용 금지.
- **빈 페이지:** 빈 마크다운 → 빈 배열 반환.
- **front-matter:** notion-to-md가 front-matter를 생성하지 않지만, 만약 있다면 (`---\n...\n---\n`) 무시.
- **테이블/체크박스/콜아웃 등 노션 블록:** notion-to-md 변환 결과를 그대로 사용. 별도 처리 금지.

### 5. 테스트 (TDD: 먼저 작성)

#### `specs/chunking.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { chunkMarkdown, chunkPages, stableHash } from "@/lib/chunking";
import type { NotionPageContent } from "@/types/notion";

const samplePage = (markdown: string, id = "page-1"): NotionPageContent => ({
  ref: {
    id,
    title: "Sample",
    url: "https://www.notion.so/" + id,
    isPublic: true,
    category: "업무",
  },
  markdown,
});

describe("stableHash", () => {
  it("is deterministic", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
  });
  it("differs for different inputs", () => {
    expect(stableHash("abc")).not.toBe(stableHash("def"));
  });
});

describe("chunkMarkdown", () => {
  it("returns empty for empty input", () => {
    expect(chunkMarkdown(samplePage(""), "project")).toEqual([]);
  });

  it("splits by H2 headings", () => {
    const md = `## Section A\nfoo bar\n## Section B\nbaz qux`;
    const chunks = chunkMarkdown(samplePage(md), "project");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].headingPath).toEqual(["Section A"]);
    expect(chunks[1].headingPath).toEqual(["Section B"]);
  });

  it("preserves H1 → H2 → H3 path", () => {
    const md = `# Top\n## Mid\n### Leaf\ncontent`;
    const chunks = chunkMarkdown(samplePage(md), "project");
    expect(chunks[chunks.length - 1].headingPath).toEqual(["Top", "Mid", "Leaf"]);
  });

  it("never splits code blocks", () => {
    const longCode = "```ts\n" + "const x = 1;\n".repeat(200) + "```";
    const md = `## Code\n${longCode}`;
    const chunks = chunkMarkdown(samplePage(md), "project");
    // 코드블록 한 덩어리 → chunk 1개에 모두 포함
    expect(chunks.filter((c) => c.text.includes("const x = 1")).length).toBe(1);
    expect(chunks[0].text).toContain("```ts");
    expect(chunks[0].text).toContain("```");
  });

  it("merges short trailing chunks", () => {
    const md = `## Long\n${"word ".repeat(400)}\n## Tiny\nshort`;
    const chunks = chunkMarkdown(samplePage(md), "project", { mergeBelowTokens: 50 });
    // tiny가 long에 머지되어 chunk 1개
    expect(chunks).toHaveLength(1);
  });

  it("emits warning on > 30 chunks per page", () => {
    const sections = Array.from({ length: 35 }, (_, i) => `## S${i}\ncontent ${i}`).join("\n");
    const warns: string[] = [];
    const chunks = chunkMarkdown(samplePage(sections), "project", {
      mergeBelowTokens: 0,
      maxChunksPerPage: 30,
      onWarn: (m) => warns.push(m),
    });
    expect(chunks.length).toBeLessThanOrEqual(30);
    expect(warns.some((w) => /30/.test(w))).toBe(true);
  });

  it("populates id, sourcePageId, sourceUrl, category, tokens", () => {
    const md = `## A\nfoo`;
    const [c] = chunkMarkdown(samplePage(md, "p-xyz"), "intro");
    expect(c.id).toBeTruthy();
    expect(c.sourcePageId).toBe("p-xyz");
    expect(c.sourceUrl).toBe("https://www.notion.so/p-xyz");
    expect(c.category).toBe("intro");
    expect(c.tokens).toBeGreaterThan(0);
    expect(c.embedding).toEqual([]);
  });

  it("populates tags from keywords", () => {
    const md = `## Module Federation\nNext.js Turbopack Module Federation Module`;
    const [c] = chunkMarkdown(samplePage(md), "project");
    expect(c.tags).toBeDefined();
    expect(c.tags!.length).toBeGreaterThan(0);
  });

  it("ids are deterministic across runs", () => {
    const md = `## A\nfoo`;
    const [a] = chunkMarkdown(samplePage(md, "p1"), "project");
    const [b] = chunkMarkdown(samplePage(md, "p1"), "project");
    expect(a.id).toBe(b.id);
  });
});

describe("chunkPages", () => {
  it("respects per-page limit", () => {
    const pages = [samplePage("## A\nfoo", "p1"), samplePage("## B\nbar", "p2")];
    const chunks = chunkPages(pages, () => "project");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].sourcePageId).toBe("p1");
    expect(chunks[1].sourcePageId).toBe("p2");
  });
});
```

### TDD 순서

1. `specs/chunking.spec.ts` 먼저 작성 → `npm run test` 실패 확인.
2. `lib/chunking.ts` 작성 → 테스트 통과.
3. lint/tsc/build 통과 확인.

## Acceptance Criteria

```bash
npm run test                                       # 신규 spec 통과
npx tsc --noEmit                                   # 0 exit
npm run lint
npm run build

test -f lib/chunking.ts
test -f specs/chunking.spec.ts
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - 코드블록 분할 금지 동작?
   - heading path 유지?
   - id deterministic?
   - 페이지당 한도 적용 + onWarn?
   - 외부 의존성 추가 없음? (npm ls 출력 변화 없음)
3. `phases/1-content-pipeline/index.json` step 1 갱신.

## 금지사항

- **외부 라이브러리(remark, unified, marked, mdast 등) 추가 금지.** 이유: 단순 정규식 + line-based parsing으로 충분. 의존성 최소화.
- **`Date.now()`, `Math.random()` 사용 금지.** 이유: id deterministic 보장.
- **`crypto` Node 모듈 import 금지.** 이유: Edge 호환 필요 (후속 retriever가 Edge에서 chunk를 사용). fnv-1a 직접 구현 또는 `crypto.subtle.digest` 비동기 회피 → 동기 hash.
- **임베딩 호출 작성 금지.** 이유: step 3 범위.
- **노션 SDK import 금지.** 이유: step 2 범위.
- **`portfolio.server.json` I/O 코드 작성 금지.** 이유: step 4 범위.
- **`async`/`await` 사용 금지** (`chunkMarkdown` 시그니처). 이유: pure + 동기. 비동기는 hash/embedding 단계에 한정.
