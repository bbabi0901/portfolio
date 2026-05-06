# Step 5: portfolio-loader-retriever

## 읽어야 할 파일

- `/CLAUDE.md` — `data/portfolio.server.json`은 서버 전용, 클라이언트 누출 금지
- `/docs/AI_CONTRACT.md` — retriever 입력/출력 형식, 시스템 프롬프트가 chunks를 받는 방식
- `/docs/ARCHITECTURE.md` — `lib/retriever.ts`, `lib/portfolio-data.ts` 역할
- `/docs/ADR.md` — ADR-004 정적 JSON RAG, ADR-014 Edge/Node split
- `/docs/NOTION_SCHEMA.md` — chunks 구조, retrieval 정책 (FEAT-006)
- `/spec.json` — retrieval config (topK 8, weights k=0.4 v=0.6, minVectorScore 0.3, minQueryLengthForEmbedding 5) — 실제 값 확인

이전 step 산출물:

- `/types/portfolio.ts` — `PortfolioServerData`, `PortfolioChunk`
- `/lib/tokenize.ts` — `tokenize`, `extractKeywords`, `estimateTokens`
- `/lib/embeddings.ts` — `cosineSimilarity`, `mergeScores`, `fixtureEmbedding`
- `/services/openai-embeddings.ts` — `createEmbeddingsService` (질문 임베딩용)
- `/data/portfolio.server.json` — 빌드 산출물 (mock 모드라도 존재)
- `/data/portfolio.sample.json` — fallback

위 파일들을 읽고 retriever가 chunks/embeddings를 정확히 활용하도록 한다. 특히 `lib/embeddings.ts`의 `mergeScores` weights가 spec.json과 일치해야 한다 (기본 0.4/0.6).

## 작업

두 모듈 분리:
- `lib/portfolio-data.ts` — JSON 로더 (Node only).
- `lib/retriever.ts` — 검색 로직 (pure function, edge 호환).

### 생성할 파일

#### `lib/portfolio-data.ts` (Node-only)

```ts
import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { PortfolioServerData } from "@/types/portfolio";

/**
 * data/portfolio.server.json 또는 fallback data/portfolio.sample.json 로드.
 * 메모리 캐시 (모듈 단위 싱글톤). 핫리로드 안전성을 위해 clearCache 제공.
 *
 * 우선순위:
 * 1. data/portfolio.server.json (존재 + valid)
 * 2. data/portfolio.sample.json (fallback)
 * 3. throw (둘 다 없음)
 */
export function loadPortfolio(): PortfolioServerData;

/**
 * 캐시 무효화. 테스트용.
 */
export function clearPortfolioCache(): void;

/**
 * 클라이언트로 보낼 슬림 데이터 생성. embedding 제외.
 * suggestedQuestions, profile, generatedAt만 노출.
 * scripts/generate-suggestions에서 사용.
 */
export function toClientData(data: PortfolioServerData): import("@/types/portfolio").PortfolioClientData;
```

핵심 규칙:
- `"server-only"` 첫 줄 강제.
- 데이터 검증: zod 또는 단순 type guard (chunks 배열, embedding 길이 1536 등). 위반 시 throw.
- 캐시: 모듈 스코프 `let cached: PortfolioServerData | null = null`.
- Fallback 로직 명시.

#### `lib/retriever.ts` (pure, Edge 호환)

```ts
import type { PortfolioChunk, PortfolioServerData } from "@/types/portfolio";

export interface RetrieveOptions {
  /** 질문 임베딩 (1536d). 없으면 키워드만. 짧은 질문(<5자)에서 임베딩 스킵 권장. */
  queryEmbedding?: number[];
  /** 키워드 가중치 (default 0.4) */
  keywordWeight?: number;
  /** 벡터 가중치 (default 0.6) */
  vectorWeight?: number;
  /** 결과 chunk 상한 (default 8) */
  topK?: number;
  /** 토큰 합 상한. 초과 시 후순위 컷 (default 6000) */
  maxTokens?: number;
  /** 벡터 점수 임계 (default 0.3). 모든 청크가 이 미만이면 [] 반환. */
  minVectorScore?: number;
  /** 결과 sortField (default "merged") */
  sortBy?: "merged" | "vector" | "keyword";
}

export interface RetrievalResult {
  chunk: PortfolioChunk;
  scores: { keyword: number; vector: number; merged: number };
}

export interface RetrievalSummary {
  results: RetrievalResult[];
  /** 검색이 실제로 사용한 모드 */
  mode: "keyword-only" | "vector-only" | "hybrid";
  /** 모든 점수가 임계 미만 → 빈 결과인 경우 true */
  empty: boolean;
}

/**
 * 하이브리드 검색.
 * 1. tokenize(query) → 각 chunk text/headingPath/tags와 키워드 매칭 → keywordScore [0,1].
 *    매칭 점수 = (matched_terms / query_terms) 정규화.
 * 2. queryEmbedding 있으면 chunks의 embedding과 cosineSimilarity → vectorScore [-1,1].
 * 3. mergeScores(k, v, weights) → mergedScore.
 * 4. 정렬 후 topK 제한 + 토큰 합 maxTokens 제한.
 * 5. 모든 chunks의 vectorScore < minVectorScore && keywordScore == 0 → empty=true.
 */
export function retrieve(
  query: string,
  data: PortfolioServerData,
  options?: RetrieveOptions
): RetrievalSummary;
```

핵심 규칙:
- pure function: 입력 동일 → 출력 동일. 외부 상태 의존 금지.
- 빈 chunks → empty=true, results=[].
- 빈 query → empty=true.
- queryEmbedding 차원이 chunks의 embedding과 다르면 throw.
- topK는 maxTokens 컷 이전 적용.
- "keyword-only" 모드: queryEmbedding 미제공.
- "vector-only" 모드: 사용 안 함 (항상 키워드도 같이 계산). `mode`는 hybrid 또는 keyword-only.

#### `specs/portfolio-data.spec.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadPortfolio, clearPortfolioCache, toClientData } from "@/lib/portfolio-data";

describe("portfolio-data loader", () => {
  beforeEach(() => clearPortfolioCache());

  it("loads from data/portfolio.sample.json (fallback)", () => {
    // sample이 step 4에서 항상 생성되어 있다고 가정.
    const data = loadPortfolio();
    expect(data.chunks.length).toBeGreaterThan(0);
    expect(data.suggestedQuestions).toBeDefined();
  });

  it("toClientData strips embeddings", () => {
    const server = loadPortfolio();
    const client = toClientData(server);
    expect("chunks" in client).toBe(false);  // 클라이언트는 chunks 없음
    expect(client.suggestedQuestions).toBeDefined();
    expect(client.profile).toBeDefined();
  });

  it("caches across calls", () => {
    const a = loadPortfolio();
    const b = loadPortfolio();
    expect(a).toBe(b);  // 동일 객체 참조
  });

  it("clearCache invalidates", () => {
    const a = loadPortfolio();
    clearPortfolioCache();
    const b = loadPortfolio();
    expect(a).not.toBe(b);
  });
});
```

#### `specs/retriever.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { retrieve } from "@/lib/retriever";
import { fixtureEmbedding } from "@/lib/embeddings";
import type { PortfolioServerData, PortfolioChunk } from "@/types/portfolio";

const mkChunk = (id: string, text: string, headingPath: string[] = [], tags: string[] = []): PortfolioChunk => ({
  id,
  sourcePageId: "p1",
  sourceTitle: "Sample",
  sourceUrl: "https://www.notion.so/p1",
  category: "project",
  headingPath,
  text,
  tokens: 100,
  embedding: fixtureEmbedding(text, 1536),
  tags,
});

const mkData = (chunks: PortfolioChunk[]): PortfolioServerData => ({
  version: "0.1.0",
  generatedAt: "2026-05-06T12:00:00+09:00",
  chunks,
  suggestedQuestions: [],
  profile: { name: "김윤수", oneLiner: "", contact: { email: "" } },
});

describe("retrieve", () => {
  it("returns top-K matching chunks", () => {
    const data = mkData([
      mkChunk("c1", "Module Federation 마이그레이션", ["MFE TF"], ["Module Federation"]),
      mkChunk("c2", "전혀 무관한 내용"),
    ]);
    const out = retrieve("Module Federation 어떻게?", data, {
      queryEmbedding: fixtureEmbedding("Module Federation 어떻게?", 1536),
      topK: 2,
    });
    expect(out.results[0].chunk.id).toBe("c1");
    expect(out.results[0].scores.keyword).toBeGreaterThan(0);
    expect(out.empty).toBe(false);
    expect(out.mode).toBe("hybrid");
  });

  it("keyword-only mode when no embedding", () => {
    const data = mkData([mkChunk("c1", "Next.js Turbopack")]);
    const out = retrieve("Turbopack", data);
    expect(out.mode).toBe("keyword-only");
    expect(out.results.length).toBeGreaterThan(0);
  });

  it("respects topK", () => {
    const chunks = Array.from({ length: 20 }, (_, i) => mkChunk(`c${i}`, `text ${i}`));
    const data = mkData(chunks);
    const out = retrieve("text", data, { topK: 5 });
    expect(out.results.length).toBeLessThanOrEqual(5);
  });

  it("respects maxTokens cap", () => {
    const chunks = Array.from({ length: 20 }, (_, i) => ({ ...mkChunk(`c${i}`, "common term"), tokens: 1000 }));
    const data = mkData(chunks);
    const out = retrieve("common", data, { topK: 20, maxTokens: 3500 });
    const total = out.results.reduce((s, r) => s + r.chunk.tokens, 0);
    expect(total).toBeLessThanOrEqual(3500);
  });

  it("returns empty when below minVectorScore and no keyword match", () => {
    const data = mkData([mkChunk("c1", "전혀 다른 토픽")]);
    const out = retrieve("zzzqqq", data, {
      queryEmbedding: fixtureEmbedding("zzzqqq", 1536),
      minVectorScore: 0.99,
    });
    expect(out.empty).toBe(true);
  });

  it("throws on dimension mismatch", () => {
    const data = mkData([{ ...mkChunk("c1", "x"), embedding: [1, 0] }]);
    expect(() =>
      retrieve("x", data, { queryEmbedding: fixtureEmbedding("x", 1536) })
    ).toThrow();
  });

  it("handles empty data", () => {
    const out = retrieve("anything", mkData([]));
    expect(out.empty).toBe(true);
    expect(out.results).toEqual([]);
  });

  it("handles empty query", () => {
    const data = mkData([mkChunk("c1", "x")]);
    const out = retrieve("", data);
    expect(out.empty).toBe(true);
  });
});
```

### TDD 순서

1. `specs/retriever.spec.ts`, `specs/portfolio-data.spec.ts` 작성 → 실패.
2. `lib/portfolio-data.ts` 작성 → 통과.
3. `lib/retriever.ts` 작성 → 통과.
4. lint/tsc/build 통과.

### 핵심 규칙

- `lib/retriever.ts`는 pure (Edge runtime 호환). `node:fs`, `node:path` 사용 금지.
- `lib/portfolio-data.ts`는 Node only (`server-only` import).
- 검색은 deterministic (같은 입력 → 같은 출력).
- 토큰 컷은 정렬 후 (점수 높은 청크 우선).
- 차원 검증은 첫 chunk만 비교 (성능). 중간에 다르면 zod에서 잡힘.

## Acceptance Criteria

```bash
npm run test                                  # 신규 spec 모두 통과
npx tsc --noEmit
npm run lint
npm run build

test -f lib/portfolio-data.ts
test -f lib/retriever.ts
test -f specs/retriever.spec.ts
test -f specs/portfolio-data.spec.ts

# server-only import 강제
grep -q '"server-only"' lib/portfolio-data.ts
! grep -q '"server-only"' lib/retriever.ts
! grep -E '^import.*node:' lib/retriever.ts
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - retriever pure (Edge 호환)?
   - portfolio-data server-only?
   - 점수 머지 weights 0.4/0.6 default?
   - 차원 mismatch throw?
   - 빈 입력/빈 데이터 graceful?
3. `phases/1-content-pipeline/index.json` step 5 갱신.

## 금지사항

- **`lib/retriever.ts`에서 Node 모듈 import 금지** (`fs`, `path`, `node:*`). 이유: Edge runtime 호환 필요.
- **`lib/retriever.ts`에서 `process.env` 참조 금지.** 이유: pure 함수.
- **`lib/portfolio-data.ts`를 client component에서 import 금지.** 이유: 임베딩 누출. server-only로 강제.
- **임베딩 호출 금지** (이 step). 이유: 질문 임베딩은 `/api/chat` 라우트에서 호출 (후속 task).
- **caching 외에 mutating global state 금지.** 이유: 테스트 고립.
- **`Math.random()`, `Date.now()` 사용 금지** (검색 로직). 이유: deterministic.
- **결과 chunk text 변형 금지** (요약, truncate 등). 이유: 시스템 프롬프트가 받는 raw 컨텍스트는 그대로 전달.
- **fallback에서 sample.json 로드 실패 시 silent fail 금지.** 이유: 명확한 에러 (운영자 알림).
