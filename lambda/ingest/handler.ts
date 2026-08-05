import specJson from "@/spec.json";
import { compareFreshness } from "@/lib/notion-freshness";
import {
  buildServerData,
  collectSourceRefs,
  fetchChunksFromRefs,
  nowIsoKst,
  parseIdList,
  toCorpus,
} from "@/lib/sync/core";
import { createBedrockEmbeddingsService } from "@/services/bedrock-embeddings";
import { createNotionService } from "@/services/notion";
import { createVectorStore } from "@/services/s3-vectors";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

/**
 * Sync Lambda (ADR-037, FEAT-038) — EventBridge 24h 주기 실행.
 * freshness 선체크(저렴한 ref 조회만) 후 stale 일 때만 fetch→청킹→임베딩→
 * S3 Vectors 업서트 + corpus.json 갱신. 자격 증명은 Lambda 실행 역할(기본 체인).
 * 임베딩 캐시는 없음 — stale 시에만 실행되고 287청크 전량 재임베딩도 ~$0.002 (Titan).
 */

interface IngestResult {
  synced: boolean;
  reason: string;
  chunks?: number;
  orphansDeleted?: number;
}

const REGION = process.env.AWS_REGION ?? "ap-northeast-2";

let cachedToken: string | null = null;

async function notionToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const paramName = process.env.NOTION_TOKEN_PARAM;
  if (!paramName) throw new Error("NOTION_TOKEN_PARAM env is required");
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  const ssm = new SSMClient({ region: REGION });
  const out = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  const value = out.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${paramName} is empty`);
  cachedToken = value;
  return value;
}

async function corpusGeneratedAt(bucket: string, key: string): Promise<string | null> {
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: REGION });
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await out.Body?.transformToString("utf-8");
    if (!body) return null;
    const parsed = JSON.parse(body) as { generatedAt?: string };
    return typeof parsed.generatedAt === "string" ? parsed.generatedAt : null;
  } catch {
    return null; // corpus 부재/파싱 불가 → 최초 sync 로 취급
  }
}

export async function handler(): Promise<IngestResult> {
  const projectsDbId = process.env.NOTION_PROJECTS_DB_ID;
  const vectorsBucket = process.env.S3_VECTORS_BUCKET;
  const corpusBucket = process.env.CORPUS_BUCKET;
  const corpusKey = process.env.CORPUS_KEY ?? "corpus.json";
  if (!projectsDbId || !vectorsBucket || !corpusBucket) {
    throw new Error("NOTION_PROJECTS_DB_ID / S3_VECTORS_BUCKET / CORPUS_BUCKET envs are required");
  }

  const notion = createNotionService({ token: await notionToken() });
  const collected = await collectSourceRefs(notion, {
    projectsDbId,
    profilePageIds: parseIdList(process.env.NOTION_PROFILE_PAGE_IDS),
    troubleshootingDbId: process.env.NOTION_TROUBLESHOOTING_DB_ID,
    extraPageIds: parseIdList(process.env.NOTION_EXTRA_PAGE_IDS),
    onWarn: (msg) => console.warn(`[ingest] ${msg}`),
  });

  const generatedAt = await corpusGeneratedAt(corpusBucket, corpusKey);
  if (generatedAt) {
    const freshness = compareFreshness(collected.refs, generatedAt);
    if (!freshness.stale) {
      console.log(`[ingest] fresh (generatedAt ${generatedAt}) — skip`);
      return { synced: false, reason: "fresh" };
    }
    console.log(
      `[ingest] stale: ${freshness.staleRefs.length} page(s) edited after ${generatedAt}`,
    );
  } else {
    console.log("[ingest] no corpus found — initial sync");
  }

  const { pages, chunks } = await fetchChunksFromRefs(notion, collected, (msg) =>
    console.warn(`[ingest] ${msg}`),
  );
  if (chunks.length === 0) {
    throw new Error("[ingest] produced 0 chunks — refusing to write empty corpus");
  }

  const embeddings = createBedrockEmbeddingsService({ region: REGION });
  const vectors = await embeddings.embedBatch(chunks.map((c) => c.text));
  for (let i = 0; i < chunks.length; i++) {
    const v = vectors[i];
    if (!v) throw new Error(`[ingest] missing embedding for chunk index ${i}`);
    chunks[i]!.embedding = v;
  }

  const data = buildServerData({
    chunks,
    pages,
    profileIdSet: collected.profileIdSet,
    suggestedQuestions: (specJson.suggestedQuestions ?? []).map((q): SuggestedQuestionMeta => ({
      id: q.id,
      category: q.category,
      text: q.text,
      expectedSourceTitles: q.expectedSourceTitles ?? [],
    })),
    version: specJson.version,
    generatedAt: nowIsoKst(),
  });

  const store = createVectorStore({
    region: REGION,
    bucket: vectorsBucket,
    index: process.env.S3_VECTORS_INDEX ?? "portfolio-chunks",
  });
  const existing = new Set(await store.listKeys());
  await store.upsert(
    data.chunks.map((c) => ({
      chunkId: c.id,
      embedding: c.embedding,
      metadata: { category: c.category, sourcePageId: c.sourcePageId },
    })),
  );
  const current = new Set(data.chunks.map((c) => c.id));
  const orphans = [...existing].filter((k) => !current.has(k));
  await store.deleteByIds(orphans);

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: REGION });
  await s3.send(
    new PutObjectCommand({
      Bucket: corpusBucket,
      Key: corpusKey,
      Body: JSON.stringify(toCorpus(data)),
      ContentType: "application/json",
    }),
  );

  console.log(
    `[ingest] synced: ${data.chunks.length} chunks, ${orphans.length} orphans deleted, generatedAt ${data.generatedAt}`,
  );
  return {
    synced: true,
    reason: generatedAt ? "stale" : "initial",
    chunks: data.chunks.length,
    orphansDeleted: orphans.length,
  };
}
