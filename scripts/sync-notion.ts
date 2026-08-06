#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  type EmbeddingsCache,
  embeddingCacheKey,
  loadEmbeddingsCache,
  saveEmbeddingsCache,
} from "@/lib/embeddings-cache";
import {
  buildServerData,
  collectSourceRefs,
  fetchChunksFromRefs,
  nowIsoKst,
  parseIdList,
  toCorpus,
} from "@/lib/sync/core";
import { createNotionService } from "@/services/notion";
import { createBedrockEmbeddingsService, TITAN_NAMESPACE } from "@/services/bedrock-embeddings";
import type { PortfolioServerData, SuggestedQuestionMeta } from "@/types/portfolio";

export interface SyncOptions {
  outDir?: string;
  serverFileName?: string;
  sampleFileName?: string;
}

const DEFAULT_OUT_DIR = "data";
const DEFAULT_SERVER_FILE = "portfolio.server.json";
const DEFAULT_SAMPLE_FILE = "portfolio.sample.json";
const DEFAULT_CACHE_FILE = "embeddings-cache.json";
const EMBED_GROUP_SIZE = 8; // 캐시 미스 임베딩을 소그룹으로 나눠 그룹마다 증분 저장(rate-limit 중단 시 재개 가능)

const SAMPLE_MAX_CHUNKS = 8;
const SAMPLE_DIMENSIONS = 16;

const VERSION_FALLBACK = "0.1.0";

const EnvSchema = z
  .object({
    NOTION_TOKEN: z.string().optional(),
    NOTION_PROJECTS_DB_ID: z.string().optional(),
    NOTION_PROFILE_PAGE_IDS: z.string().optional(),
    // 임베딩 — Bedrock Titan v2 (ADR-034 Phase 2, FEAT-036). 로컬 sync 는 AWS 프로필 필요.
    PORTFOLIO_AWS_REGION: z.string().optional(),
    PORTFOLIO_AWS_PROFILE: z.string().optional(),
    PORTFOLIO_AWS_ROLE_ARN: z.string().optional(),
    NOTION_TROUBLESHOOTING_DB_ID: z.string().optional(),
    NOTION_EXTRA_PAGE_IDS: z.string().optional(),
    MOCK_NOTION: z.string().optional(),
    MOCK_LLM: z.string().optional(),
    SKIP_NOTION_SYNC: z.string().optional(),
  })
  .passthrough();

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true";
}

function packageVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? VERSION_FALLBACK;
  } catch {
    return VERSION_FALLBACK;
  }
}

function loadSuggestedQuestions(): SuggestedQuestionMeta[] {
  const specPath = path.join(process.cwd(), "spec.json");
  try {
    const raw = fs.readFileSync(specPath, "utf8");
    const parsed = JSON.parse(raw) as {
      suggestedQuestions?: Array<{
        id: string;
        category: string;
        text: string;
        expectedSourceTitles?: string[];
      }>;
    };
    return (parsed.suggestedQuestions ?? []).map((q) => ({
      id: q.id,
      category: q.category,
      text: q.text,
      expectedSourceTitles: q.expectedSourceTitles ?? [],
    }));
  } catch {
    return [];
  }
}

function makeSampleData(full: PortfolioServerData): PortfolioServerData {
  const chunks = full.chunks.slice(0, SAMPLE_MAX_CHUNKS).map((c) => ({
    ...c,
    embedding: c.embedding.slice(0, SAMPLE_DIMENSIONS),
  }));
  return {
    version: full.version,
    generatedAt: full.generatedAt,
    chunks,
    suggestedQuestions: full.suggestedQuestions,
    profile: full.profile,
  };
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function fail(message: string): never {
  throw new Error(message);
}

export async function main(opts: SyncOptions = {}): Promise<void> {
  const env = EnvSchema.parse(process.env);

  if (isOn(env.SKIP_NOTION_SYNC)) {
    console.log("[sync-notion] SKIP_NOTION_SYNC=1 — skipped");
    return;
  }

  const mockNotion = isOn(env.MOCK_NOTION);
  const mockLlm = isOn(env.MOCK_LLM);

  if (!mockNotion) {
    if (!env.NOTION_TOKEN) {
      fail(
        "[sync-notion] NOTION_TOKEN is required (set MOCK_NOTION=1 to use fixtures, or SKIP_NOTION_SYNC=1 to skip)",
      );
    }
    if (!env.NOTION_PROJECTS_DB_ID) {
      fail("[sync-notion] NOTION_PROJECTS_DB_ID is required when MOCK_NOTION!=1");
    }
  }
  if (!mockLlm && !env.PORTFOLIO_AWS_PROFILE && !env.PORTFOLIO_AWS_ROLE_ARN) {
    fail(
      "[sync-notion] Bedrock Titan 임베딩에 AWS 자격 증명이 필요합니다 — " +
        "PORTFOLIO_AWS_PROFILE(로컬) 또는 PORTFOLIO_AWS_ROLE_ARN 설정. MOCK_LLM=1 로 픽스처 사용 가능.",
    );
  }

  const outDir = opts.outDir
    ? path.isAbsolute(opts.outDir)
      ? opts.outDir
      : path.join(process.cwd(), opts.outDir)
    : path.join(process.cwd(), DEFAULT_OUT_DIR);
  const serverFile = path.join(outDir, opts.serverFileName ?? DEFAULT_SERVER_FILE);
  const sampleFile = path.join(outDir, opts.sampleFileName ?? DEFAULT_SAMPLE_FILE);
  const cacheFile = path.join(outDir, DEFAULT_CACHE_FILE);

  const notion = createNotionService({
    token: env.NOTION_TOKEN || "fixture",
    mock: mockNotion,
  });
  const embeddings = createBedrockEmbeddingsService({
    mock: mockLlm,
    region: env.PORTFOLIO_AWS_REGION,
    profile: env.PORTFOLIO_AWS_PROFILE,
  });

  const collected = await collectSourceRefs(notion, {
    projectsDbId: env.NOTION_PROJECTS_DB_ID || "fixture-db",
    profilePageIds: parseIdList(env.NOTION_PROFILE_PAGE_IDS),
    troubleshootingDbId: env.NOTION_TROUBLESHOOTING_DB_ID,
    extraPageIds: parseIdList(env.NOTION_EXTRA_PAGE_IDS),
    onWarn: (msg) => console.warn(`[sync-notion] ${msg}`),
  });
  const { pages, chunks } = await fetchChunksFromRefs(notion, collected, (msg) =>
    console.warn(`[sync-notion] ${msg}`),
  );

  if (chunks.length === 0) {
    fail("[sync-notion] produced 0 chunks — refusing to write empty portfolio");
  }

  // ── 임베딩 (캐시 우선) ──────────────────────────────────────────────────────
  // provider/model 이 바뀌면 벡터 공간이 달라지므로 네임스페이스에 포함해 캐시를 분리.
  const embedNamespace = TITAN_NAMESPACE;

  const cache: EmbeddingsCache = loadEmbeddingsCache(cacheFile);
  const keys = chunks.map((c) => embeddingCacheKey(embedNamespace, c.text));
  const missIdx: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!cache[keys[i]!]) missIdx.push(i);
  }

  // 캐시 미스만 소그룹으로 임베딩하고 그룹마다 증분 저장(rate-limit 로 중단돼도 재실행 시 재개).
  for (let g = 0; g < missIdx.length; g += EMBED_GROUP_SIZE) {
    const group = missIdx.slice(g, g + EMBED_GROUP_SIZE);
    const vectors = await embeddings.embedBatch(group.map((i) => chunks[i]!.text));
    for (let k = 0; k < group.length; k++) {
      const v = vectors[k];
      if (!v) fail(`[sync-notion] missing embedding for chunk index ${group[k]}`);
      cache[keys[group[k]!]!] = v;
    }
    saveEmbeddingsCache(cacheFile, cache);
  }

  for (let i = 0; i < chunks.length; i++) {
    const v = cache[keys[i]!];
    if (!v) fail(`[sync-notion] missing cached embedding for chunk index ${i}`);
    chunks[i]!.embedding = v;
  }

  // 더 이상 사용되지 않는 캐시 항목 제거 후 최종 저장.
  const pruned: EmbeddingsCache = {};
  for (const k of keys) {
    const v = cache[k];
    if (v) pruned[k] = v;
  }
  saveEmbeddingsCache(cacheFile, pruned);
  console.log(
    `[sync-notion] embeddings: ${missIdx.length} new (API), ${chunks.length - missIdx.length} from cache`,
  );

  const data = buildServerData({
    chunks,
    pages,
    profileIdSet: collected.profileIdSet,
    suggestedQuestions: loadSuggestedQuestions(),
    version: packageVersion(),
    generatedAt: nowIsoKst(),
  });

  writeJson(serverFile, data);
  // 커밋 대상은 슬림 폴백(임베딩 제외, ADR-038) — server.json/캐시는 로컬 산출물(git 미커밋)
  writeJson(path.join(outDir, "portfolio.fallback.json"), toCorpus(data));
  // sample 은 CI/테스트용 결정적 픽스처 — 이미 커밋돼 있으면 덮어쓰지 않는다
  // (실데이터로 갱신되면 sample 기준으로 캘리브레이션된 테스트가 비결정적으로 깨짐).
  if (!fs.existsSync(sampleFile)) {
    writeJson(sampleFile, makeSampleData(data));
  }

  console.log(
    `✓ ${data.chunks.length} chunks, ${pages.length} pages, ` +
      `${data.suggestedQuestions.length} questions, generatedAt ${data.generatedAt}`,
  );

  // --aws: S3 Vectors 업서트 + 고아 벡터 정리 + corpus.json 업로드 (ADR-034/037)
  if (process.argv.includes("--aws")) {
    const { createVectorStore } = await import("@/services/s3-vectors");
    const bucket = process.env.S3_VECTORS_BUCKET;
    if (!bucket) throw new Error("[sync-notion] --aws 에는 S3_VECTORS_BUCKET 이 필요합니다");
    const credentialProvider = (
      await import("@/services/aws-credentials")
    ).createAwsCredentialProvider({
      profile: process.env.PORTFOLIO_AWS_PROFILE,
    });
    const store = createVectorStore({
      region: process.env.PORTFOLIO_AWS_REGION ?? "ap-northeast-2",
      bucket,
      index: process.env.S3_VECTORS_INDEX ?? "portfolio-chunks",
      credentialProvider,
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
    console.log(`✓ S3 Vectors: ${data.chunks.length} upserted, ${orphans.length} orphans deleted`);

    // corpus.json — 런타임이 10분 TTL 로 읽는 소스 (ADR-037)
    const corpusBucket = process.env.CORPUS_S3_BUCKET;
    if (corpusBucket) {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({
        region: process.env.PORTFOLIO_AWS_REGION ?? "ap-northeast-2",
        credentials: credentialProvider,
      });
      await s3.send(
        new PutObjectCommand({
          Bucket: corpusBucket,
          Key: process.env.CORPUS_S3_KEY ?? "corpus.json",
          Body: JSON.stringify(toCorpus(data)),
          ContentType: "application/json",
        }),
      );
      console.log(`✓ corpus.json uploaded to s3://${corpusBucket}`);
    }
  }
}

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const resolved = path.resolve(entry);
  // tsx runs the .ts file directly; check filename match
  return resolved.endsWith("sync-notion.ts") || resolved.endsWith("sync-notion.js");
})();

if (isDirectRun) {
  main().catch((err: Error) => {
    console.error(err.message ?? String(err));
    process.exit(1);
  });
}
