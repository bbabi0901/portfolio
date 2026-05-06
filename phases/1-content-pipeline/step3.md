# Step 3: embeddings-service

## 읽어야 할 파일

- `/CLAUDE.md` — OPENAI_API_KEY 클라이언트 노출 금지, server-only
- `/docs/AI_CONTRACT.md` — 임베딩 모델(`text-embedding-3-small`, 1536d)
- `/docs/ARCHITECTURE.md` — `services/openai-embeddings.ts` 위치
- `/docs/ADR.md` — ADR-004 (build-time static JSON RAG)
- `/.env.local.example` — `OPENAI_API_KEY`, `MOCK_LLM`

이전 step 산출물:

- `/lib/embeddings.ts` — `fixtureEmbedding`, `cosineSimilarity` (이 step에서 fixture 폴백에 사용)
- `/services/notion.ts` — server-only import 패턴 (이 step도 동일하게)
- `/tests/msw/handlers.ts` — Notion handler. 이 step에서 OpenAI handler 추가.

`lib/embeddings.ts`의 `fixtureEmbedding(text, dimensions)`을 import하여 MOCK 모드 폴백에 사용한다.

## 작업

OpenAI `text-embedding-3-small` 호출 wrapper. 환경변수 `MOCK_LLM=1`이면 fixture 사용. 정확도보다 결정성 + 비용 절감 우선.

### 의존성 추가 (`package.json`)

이미 다음 task들에서 OpenAI를 chat에서도 쓰지만, 임베딩은 raw fetch로 충분 (SDK 추가 회피 가능). **이 step에서는 SDK 추가하지 않고 fetch 사용** — 후속 task(2-chat-backend)에서 `@ai-sdk/openai` 추가될 때 의존성 정리.

### 생성할 파일

#### `services/openai-embeddings.ts` (Node-only, Edge에서도 fetch만 사용 가능하므로 universal하게 작성 가능하나, 빌드 스크립트 위주)

```ts
import "server-only";

export interface EmbeddingsServiceOptions {
  apiKey: string;
  /** MOCK_LLM=1 환경변수와 일치. true면 lib/embeddings.fixtureEmbedding 사용. */
  mock?: boolean;
  /** OpenAI API base URL (테스트/proxy용). 기본 https://api.openai.com */
  baseURL?: string;
  /** 모델 이름 (기본 text-embedding-3-small) */
  model?: string;
  /** 차원. 1536 (default). text-embedding-3-small max=1536 */
  dimensions?: number;
  /** 호출당 텍스트 batch 상한 (default 96, OpenAI 권장) */
  maxBatchSize?: number;
}

export interface EmbeddingsService {
  /**
   * 단일 텍스트 임베딩.
   */
  embed(text: string): Promise<number[]>;

  /**
   * 배치 임베딩. 입력 순서 유지.
   * 입력 길이가 maxBatchSize 초과 시 내부적으로 chunk 처리.
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingsService(opts: EmbeddingsServiceOptions): EmbeddingsService;
```

핵심 규칙:
- `"server-only"` 첫 줄 강제.
- `apiKey`는 옵션으로만. `process.env.OPENAI_API_KEY` 직접 참조 금지.
- MOCK 모드: `lib/embeddings.fixtureEmbedding(text, dimensions)`.
- OpenAI fetch: `POST {baseURL}/v1/embeddings` with `{ model, input, dimensions }`. 응답은 `{ data: [{ embedding: number[] }] }`.
- 4xx/429: backoff 4회 재시도 (250→500→1000→2000ms). 5xx 즉시 throw.
- 빈 입력 → 빈 배열.

#### `tests/msw/handlers.ts` 갱신

```ts
import { http, HttpResponse } from "msw";
import { fixtureEmbedding } from "@/lib/embeddings";

const NOTION_BASE = "https://api.notion.com";
const OPENAI_BASE = "https://api.openai.com";

export const notionHandlers = [
  /* ... 기존 ... */
];

export const openaiHandlers = [
  http.post(`${OPENAI_BASE}/v1/embeddings`, async ({ request }) => {
    const body = (await request.json()) as { input: string | string[]; dimensions?: number };
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const dim = body.dimensions ?? 1536;
    return HttpResponse.json({
      data: inputs.map((t, i) => ({
        object: "embedding",
        index: i,
        embedding: fixtureEmbedding(t, dim),
      })),
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 0, total_tokens: 0 },
    });
  }),
];

export const handlers = [...notionHandlers, ...openaiHandlers];
```

#### `specs/embeddings-service.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { createEmbeddingsService } from "@/services/openai-embeddings";
import { cosineSimilarity } from "@/lib/embeddings";

describe("EmbeddingsService", () => {
  describe("MOCK mode", () => {
    const svc = createEmbeddingsService({ apiKey: "fake", mock: true });

    it("returns 1536-dim unit vector", async () => {
      const v = await svc.embed("hello");
      expect(v).toHaveLength(1536);
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(n).toBeCloseTo(1, 3);
    });

    it("is deterministic", async () => {
      const a = await svc.embed("hello");
      const b = await svc.embed("hello");
      expect(a).toEqual(b);
    });

    it("differs across inputs", async () => {
      const a = await svc.embed("hello");
      const b = await svc.embed("world");
      expect(cosineSimilarity(a, b)).not.toBeCloseTo(1);
    });

    it("embedBatch preserves order", async () => {
      const vs = await svc.embedBatch(["a", "b", "c"]);
      expect(vs).toHaveLength(3);
      const single_b = await svc.embed("b");
      expect(vs[1]).toEqual(single_b);
    });

    it("handles empty array", async () => {
      expect(await svc.embedBatch([])).toEqual([]);
    });
  });

  describe("non-MOCK mode (msw)", () => {
    const svc = createEmbeddingsService({ apiKey: "fake", mock: false });

    it("calls OpenAI endpoint via msw", async () => {
      const v = await svc.embed("integration");
      expect(v).toHaveLength(1536);
    });

    it("batch chunking respects maxBatchSize", async () => {
      const svc2 = createEmbeddingsService({ apiKey: "fake", mock: false, maxBatchSize: 2 });
      const inputs = ["a", "b", "c", "d", "e"];
      const out = await svc2.embedBatch(inputs);
      expect(out).toHaveLength(5);
    });
  });

  describe("error handling", () => {
    it("throws when apiKey missing", () => {
      expect(() => createEmbeddingsService({ apiKey: "" })).toThrow();
    });
  });
});
```

### TDD 순서

1. msw OpenAI handler 추가 (handlers.ts).
2. `specs/embeddings-service.spec.ts` 작성 → 실패.
3. `services/openai-embeddings.ts` 작성 → 통과.
4. lint/tsc/build 통과.

### 핵심 규칙

- 서버 전용 (`"server-only"`).
- API 키는 옵션 파라미터.
- MOCK 모드는 `lib/embeddings.fixtureEmbedding` 재사용.
- 4xx/429 backoff, 5xx 즉시 throw.
- 빈 입력 → 빈 결과 (빈 배열 또는 0차원 빈 벡터 — 시그니처 준수).
- OpenAI dimension parameter로 1536 명시 (text-embedding-3-large도 호출 가능하지만 이 step은 small 고정).

## Acceptance Criteria

```bash
npm run test                              # spec 통과
npx tsc --noEmit
npm run lint
npm run build

test -f services/openai-embeddings.ts
test -f specs/embeddings-service.spec.ts
grep -q '"server-only"' services/openai-embeddings.ts
grep -q 'fixtureEmbedding' tests/msw/handlers.ts

# OPENAI_API_KEY 직접 참조 0건
! grep -rn 'process.env.OPENAI_API_KEY' services/openai-embeddings.ts
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - server-only import?
   - MOCK / non-MOCK 모두 테스트 통과?
   - 차원 1536, unit vector?
   - batch 순서 보존, chunking 정상?
3. `phases/1-content-pipeline/index.json` step 3 갱신.

## 금지사항

- **`process.env.OPENAI_API_KEY` 직접 참조 금지.** 이유: 옵션 주입 + 테스트 용이성.
- **`@ai-sdk/openai`, `openai` SDK 추가 금지** (이 step). 이유: fetch로 충분. 후속 chat task에서 SDK 도입.
- **client component에서 import 금지.** 이유: API 키 누출.
- **batch 크기 무제한 금지.** 이유: OpenAI 요청 페이로드 한도. maxBatchSize 기본 96.
- **5xx 무한 재시도 금지.** 이유: 빌드 hang.
- **임베딩 결과 caching 금지** (이 step). 이유: 빌드시 1회 호출이라 불필요. 캐시는 sync-notion에서 별도 결정.
- **dimensions 파라미터 생략 금지.** 이유: 명시적으로 1536 고정. 모델 변경 시 차원 미스매치 방지.
- **chunking 호출 금지.** 이유: 다음 step(sync-notion).
- **`portfolio.server.json` I/O 금지.** 이유: 다음 step.
