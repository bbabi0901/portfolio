import { describe, it, expect, vi } from "vitest";
import {
  createBedrockEmbeddingsService,
  TITAN_MODEL_ID,
  TITAN_DIMENSIONS,
  TITAN_NAMESPACE,
} from "@/services/bedrock-embeddings";
import { fixtureEmbedding } from "@/lib/embeddings";

describe("bedrock-embeddings (FEAT-036, TS-90)", () => {
  it("네임스페이스는 model@dims — ADR-029 캐시 무효화 메커니즘과 정합", () => {
    expect(TITAN_MODEL_ID).toBe("amazon.titan-embed-text-v2:0");
    expect(TITAN_DIMENSIONS).toBe(1024);
    expect(TITAN_NAMESPACE).toBe("amazon.titan-embed-text-v2:0@1024");
  });

  it("mock 모드: fixtureEmbedding 1024차원, 외부 호출 0회", async () => {
    const svc = createBedrockEmbeddingsService({ mock: true });
    const v = await svc.embed("안녕하세요");
    expect(v).toHaveLength(1024);
    expect(v).toEqual(fixtureEmbedding("안녕하세요", 1024));
    const batch = await svc.embedBatch(["a", "b", "c"]);
    expect(batch).toHaveLength(3);
    expect(batch[1]).toEqual(fixtureEmbedding("b", 1024));
  });

  it("invoke 주입: embedBatch 가 텍스트별로 호출하고 순서를 보존한다 (Titan 은 배치 API 없음)", async () => {
    const calls: string[] = [];
    const invoke = vi.fn(async (text: string) => {
      calls.push(text);
      return new Array(1024).fill(text.length);
    });
    const svc = createBedrockEmbeddingsService({ invoke });
    const out = await svc.embedBatch(["일", "이십", "삼백사십"]);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(out[0]![0]).toBe(1);
    expect(out[1]![0]).toBe(2);
    expect(out[2]![0]).toBe(4);
    expect(calls.sort()).toEqual(["삼백사십", "이십", "일"].sort());
  });

  it("스로틀 에러 재시도: ThrottlingException 1회 후 성공", async () => {
    let attempts = 0;
    const invoke = vi.fn(async (text: string) => {
      attempts += 1;
      if (attempts === 1) {
        const e = new Error("Too many requests");
        e.name = "ThrottlingException";
        throw e;
      }
      return fixtureEmbedding(text, 1024);
    });
    const svc = createBedrockEmbeddingsService({ invoke, retryBackoffMs: 1 });
    const v = await svc.embed("재시도");
    expect(v).toHaveLength(1024);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("비재시도 에러는 즉시 전파", async () => {
    const invoke = vi.fn(async () => {
      const e = new Error("model access denied");
      e.name = "AccessDeniedException";
      throw e;
    });
    const svc = createBedrockEmbeddingsService({ invoke, retryBackoffMs: 1 });
    await expect(svc.embed("x")).rejects.toThrow(/access denied/);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
