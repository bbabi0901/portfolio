import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { cosineSimilarity } from "@/lib/embeddings";
import { createEmbeddingsService } from "@/services/openai-embeddings";
import { server } from "@/tests/msw/server";

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

    it("respects custom dimensions in mock mode", async () => {
      const svc2 = createEmbeddingsService({
        apiKey: "fake",
        mock: true,
        dimensions: 256,
      });
      const v = await svc2.embed("hello");
      expect(v).toHaveLength(256);
    });
  });

  describe("non-MOCK mode (msw)", () => {
    const svc = createEmbeddingsService({ apiKey: "fake", mock: false });

    it("calls OpenAI endpoint via msw", async () => {
      const v = await svc.embed("integration");
      expect(v).toHaveLength(1536);
    });

    it("batch chunking respects maxBatchSize", async () => {
      let calls = 0;
      server.use(
        http.post("https://api.openai.com/v1/embeddings", async ({ request }) => {
          calls++;
          const body = (await request.json()) as {
            input: string | string[];
            dimensions?: number;
          };
          const inputs = Array.isArray(body.input) ? body.input : [body.input];
          const dim = body.dimensions ?? 1536;
          return HttpResponse.json({
            object: "list",
            data: inputs.map((_, i) => ({
              object: "embedding",
              index: i,
              embedding: new Array(dim).fill(0).map((_, k) => (i + k) / dim),
            })),
            model: "text-embedding-3-small",
            usage: { prompt_tokens: 0, total_tokens: 0 },
          });
        }),
      );

      const svc2 = createEmbeddingsService({
        apiKey: "fake",
        mock: false,
        maxBatchSize: 2,
      });
      const inputs = ["a", "b", "c", "d", "e"];
      const out = await svc2.embedBatch(inputs);
      expect(out).toHaveLength(5);
      expect(calls).toBe(3); // ceil(5/2) = 3
    });

    it("preserves input order across batches", async () => {
      const svc2 = createEmbeddingsService({
        apiKey: "fake",
        mock: false,
        maxBatchSize: 2,
      });
      const inputs = ["alpha", "beta", "gamma", "delta", "epsilon"];
      const out = await svc2.embedBatch(inputs);
      const single0 = await svc2.embed("alpha");
      const single3 = await svc2.embed("delta");
      expect(out[0]).toEqual(single0);
      expect(out[3]).toEqual(single3);
    });
  });

  describe("error handling", () => {
    it("throws when apiKey missing", () => {
      expect(() => createEmbeddingsService({ apiKey: "" })).toThrow();
    });

    it("retries on 429 then succeeds", async () => {
      let calls = 0;
      server.use(
        http.post("https://api.openai.com/v1/embeddings", async ({ request }) => {
          calls++;
          if (calls === 1) {
            return new HttpResponse("rate limited", { status: 429 });
          }
          const body = (await request.json()) as {
            input: string | string[];
            dimensions?: number;
          };
          const inputs = Array.isArray(body.input) ? body.input : [body.input];
          const dim = body.dimensions ?? 1536;
          return HttpResponse.json({
            object: "list",
            data: inputs.map((_, i) => ({
              object: "embedding",
              index: i,
              embedding: new Array(dim).fill(0.001),
            })),
            model: "text-embedding-3-small",
          });
        }),
      );

      const svc = createEmbeddingsService({
        apiKey: "fake",
        mock: false,
        retryBackoffMs: 1,
      });
      const v = await svc.embed("retry-please");
      expect(v).toHaveLength(1536);
      expect(calls).toBe(2);
    });

    it("throws after exhausting retries on 429", async () => {
      let calls = 0;
      server.use(
        http.post("https://api.openai.com/v1/embeddings", () => {
          calls++;
          return new HttpResponse("rate limited", { status: 429 });
        }),
      );

      const svc = createEmbeddingsService({
        apiKey: "fake",
        mock: false,
        retryBackoffMs: 1,
      });
      await expect(svc.embed("x")).rejects.toThrow();
      expect(calls).toBe(4);
    });

    it("throws immediately on 5xx", async () => {
      let calls = 0;
      server.use(
        http.post("https://api.openai.com/v1/embeddings", () => {
          calls++;
          return new HttpResponse("server error", { status: 500 });
        }),
      );

      const svc = createEmbeddingsService({
        apiKey: "fake",
        mock: false,
        retryBackoffMs: 1,
      });
      await expect(svc.embed("x")).rejects.toThrow();
      expect(calls).toBe(1);
    });
  });

  afterEach(() => {
    server.resetHandlers();
  });
});
