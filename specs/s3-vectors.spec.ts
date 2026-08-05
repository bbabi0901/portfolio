import { describe, it, expect } from "vitest";
import { createVectorStore } from "@/services/s3-vectors";
import { fixtureEmbedding } from "@/lib/embeddings";

// mock 스토어 계약 — AWS 모듈 로드 0회 (lazy import 는 실경로에서만 발생)
describe("s3-vectors (mock store)", () => {
  const store = () => createVectorStore({ region: "r", bucket: "b", index: "i", mock: true });

  const item = (id: string, text: string) => ({
    chunkId: id,
    embedding: fixtureEmbedding(text, 1024),
    metadata: { category: "project", sourcePageId: "p1" },
  });

  it("upsert 후 query — 동일 벡터가 최고 유사도(≈1)로 1위", async () => {
    const s = store();
    await s.upsert([item("a", "마이크로 프론트엔드"), item("b", "웹 푸시 알림")]);
    const res = await s.query(fixtureEmbedding("마이크로 프론트엔드", 1024), { topK: 2 });
    expect(res[0]?.chunkId).toBe("a");
    expect(res[0]?.score).toBeGreaterThan(0.99);
    expect(res).toHaveLength(2);
  });

  it("topK 상한 준수 + score 내림차순", async () => {
    const s = store();
    await s.upsert(["x", "y", "z", "w"].map((id) => item(id, `text-${id}`)));
    const res = await s.query(fixtureEmbedding("text-x", 1024), { topK: 3 });
    expect(res).toHaveLength(3);
    expect(res[0]!.score).toBeGreaterThanOrEqual(res[1]!.score);
    expect(res[1]!.score).toBeGreaterThanOrEqual(res[2]!.score);
  });

  it("deleteByIds — 삭제된 키는 query/listKeys 에서 사라짐", async () => {
    const s = store();
    await s.upsert([item("a", "alpha"), item("b", "beta")]);
    await s.deleteByIds(["a"]);
    expect(await s.listKeys()).toEqual(["b"]);
    const res = await s.query(fixtureEmbedding("alpha", 1024));
    expect(res.map((r) => r.chunkId)).not.toContain("a");
  });

  it("동일 chunkId 재업서트는 덮어쓰기 (중복 없음)", async () => {
    const s = store();
    await s.upsert([item("a", "v1")]);
    await s.upsert([item("a", "v2")]);
    expect(await s.listKeys()).toEqual(["a"]);
  });
});
