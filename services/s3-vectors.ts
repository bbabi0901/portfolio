import type { AwsCredentialIdentity } from "@aws-sdk/types";
import { cosineSimilarity } from "@/lib/embeddings";

export interface VectorMatch {
  chunkId: string;
  /** cosine similarity (1 - distance) — retriever 의 vector 점수 스케일과 동일 */
  score: number;
}

export interface VectorUpsertItem {
  chunkId: string;
  embedding: number[];
  metadata: { category: string; sourcePageId: string };
}

export interface VectorStore {
  query(embedding: number[], opts?: { topK?: number }): Promise<VectorMatch[]>;
  upsert(items: VectorUpsertItem[]): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
  listKeys(): Promise<string[]>;
}

export interface S3VectorsOptions {
  region: string;
  bucket: string;
  index: string;
  credentialProvider?: () => Promise<AwsCredentialIdentity>;
  /** 테스트용 — 인메모리 fake (AWS 호출 0회) */
  mock?: boolean;
}

const PUT_BATCH = 100; // PutVectors 요청당 상한 대비 보수적 배치

/** MOCK — 인메모리 코사인 검색. 단위/통합 테스트에서 AWS 모듈 로드 0회. */
function createMockStore(): VectorStore & { _items: Map<string, VectorUpsertItem> } {
  const items = new Map<string, VectorUpsertItem>();
  return {
    _items: items,
    async query(embedding, opts) {
      const topK = opts?.topK ?? 16;
      return [...items.values()]
        .map((it) => ({ chunkId: it.chunkId, score: cosineSimilarity(it.embedding, embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
    async upsert(list) {
      for (const it of list) items.set(it.chunkId, it);
    },
    async deleteByIds(ids) {
      for (const id of ids) items.delete(id);
    },
    async listKeys() {
      return [...items.keys()];
    },
  };
}

/**
 * S3 Vectors 래퍼 (ADR-034 Phase 3). AWS SDK 는 lazy import — MOCK 경로에서 로드 0회.
 * distance(cosine) → similarity(1 - d) 변환으로 retriever 의 minVectorScore 0.3 의미 보존.
 */
export function createVectorStore(opts: S3VectorsOptions): VectorStore {
  if (opts.mock) return createMockStore();

  const clientPromise = (async () => {
    const { S3VectorsClient } = await import("@aws-sdk/client-s3vectors");
    return new S3VectorsClient({
      region: opts.region,
      ...(opts.credentialProvider ? { credentials: opts.credentialProvider } : {}),
    });
  })();

  const target = { vectorBucketName: opts.bucket, indexName: opts.index };

  return {
    async query(embedding, o) {
      const { QueryVectorsCommand } = await import("@aws-sdk/client-s3vectors");
      const client = await clientPromise;
      const out = await client.send(
        new QueryVectorsCommand({
          ...target,
          topK: o?.topK ?? 16,
          queryVector: { float32: embedding },
          returnDistance: true,
        }),
      );
      return (out.vectors ?? [])
        .filter((v) => v.key != null)
        .map((v) => ({ chunkId: v.key as string, score: 1 - (v.distance ?? 1) }));
    },

    async upsert(items) {
      const { PutVectorsCommand } = await import("@aws-sdk/client-s3vectors");
      const client = await clientPromise;
      for (let i = 0; i < items.length; i += PUT_BATCH) {
        await client.send(
          new PutVectorsCommand({
            ...target,
            vectors: items.slice(i, i + PUT_BATCH).map((it) => ({
              key: it.chunkId,
              data: { float32: it.embedding },
              metadata: it.metadata,
            })),
          }),
        );
      }
    },

    async deleteByIds(ids) {
      if (ids.length === 0) return;
      const { DeleteVectorsCommand } = await import("@aws-sdk/client-s3vectors");
      const client = await clientPromise;
      for (let i = 0; i < ids.length; i += PUT_BATCH) {
        await client.send(
          new DeleteVectorsCommand({ ...target, keys: ids.slice(i, i + PUT_BATCH) }),
        );
      }
    },

    async listKeys() {
      const { ListVectorsCommand } = await import("@aws-sdk/client-s3vectors");
      const client = await clientPromise;
      const keys: string[] = [];
      let nextToken: string | undefined;
      do {
        const out = await client.send(new ListVectorsCommand({ ...target, nextToken }));
        for (const v of out.vectors ?? []) if (v.key) keys.push(v.key);
        nextToken = out.nextToken;
      } while (nextToken);
      return keys;
    },
  };
}
