#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { chunkPages } from "@/lib/chunking";
import { createNotionService } from "@/services/notion";
import { createEmbeddingsService } from "@/services/openai-embeddings";
import type { NotionPageContent, NotionPageRef } from "@/types/notion";
import type {
  ChunkCategory,
  PortfolioChunk,
  PortfolioProfile,
  PortfolioServerData,
  SuggestedQuestionMeta,
} from "@/types/portfolio";

export interface SyncOptions {
  outDir?: string;
  serverFileName?: string;
  sampleFileName?: string;
}

const DEFAULT_OUT_DIR = "data";
const DEFAULT_SERVER_FILE = "portfolio.server.json";
const DEFAULT_SAMPLE_FILE = "portfolio.sample.json";

const SAMPLE_MAX_CHUNKS = 8;
const SAMPLE_DIMENSIONS = 16;

const ALLOWED_PROJECT_CATEGORIES = ["자체프로젝트", "업무", "외부활동"] as const;
const ALLOWED_PROJECT_STATUSES = new Set(["Done", "In progress"]);

const PROFILE_FALLBACK_NAME = "김윤수";
const PROFILE_FALLBACK_ONELINER = "프론트엔드 + 스마트컨트랙트 개발자";
const PROFILE_FALLBACK_EMAIL = "bbabi0901@gmail.com";
const PROFILE_FALLBACK_GITHUB = "https://github.com/YoonsooKim9";

const VERSION_FALLBACK = "0.1.0";

const EnvSchema = z
  .object({
    NOTION_TOKEN: z.string().optional(),
    NOTION_PROJECTS_DB_ID: z.string().optional(),
    NOTION_PROFILE_PAGE_IDS: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
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

function nowIsoKst(d: Date = new Date()): string {
  const offsetMs = 9 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mi = String(local.getUTCMinutes()).padStart(2, "0");
  const ss = String(local.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}

function parseProfilePageIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveCategory(page: NotionPageContent, profileIds: Set<string>): ChunkCategory {
  if (profileIds.has(page.ref.id)) {
    const title = page.ref.title.toLowerCase();
    if (title.includes("이력서") || title.includes("resume")) return "career";
    return "personal";
  }
  const c = page.ref.category;
  if (c === "자체프로젝트" || c === "업무" || c === "외부활동") return "project";
  if (c === "프로필" || c === "성격" || c === "취미") return "personal";
  return "subpage";
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

function extractProfile(pages: NotionPageContent[], profileIds: Set<string>): PortfolioProfile {
  const profile: PortfolioProfile = {
    name: PROFILE_FALLBACK_NAME,
    oneLiner: PROFILE_FALLBACK_ONELINER,
    contact: {
      email: PROFILE_FALLBACK_EMAIL,
      github: PROFILE_FALLBACK_GITHUB,
    },
  };

  const resumeCandidates = pages.filter((p) => {
    if (!profileIds.has(p.ref.id)) return false;
    const title = p.ref.title.toLowerCase();
    return title.includes("이력서") || title.includes("resume");
  });
  const fallback = pages.find((p) => profileIds.has(p.ref.id));
  const target = resumeCandidates[0] ?? fallback;
  if (!target) return profile;

  const lines = target.markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    profile.oneLiner = trimmed.replace(/^[-*>]\s*/, "");
    break;
  }
  return profile;
}

function sortChunks(chunks: PortfolioChunk[]): PortfolioChunk[] {
  return [...chunks].sort((a, b) => {
    if (a.sourcePageId !== b.sourcePageId) {
      return a.sourcePageId < b.sourcePageId ? -1 : 1;
    }
    const ah = a.headingPath.join("→");
    const bh = b.headingPath.join("→");
    if (ah !== bh) return ah < bh ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
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
  if (!mockLlm && !env.OPENAI_API_KEY) {
    fail("[sync-notion] OPENAI_API_KEY is required (set MOCK_LLM=1 to use fixtures)");
  }

  const outDir = opts.outDir
    ? path.isAbsolute(opts.outDir)
      ? opts.outDir
      : path.join(process.cwd(), opts.outDir)
    : path.join(process.cwd(), DEFAULT_OUT_DIR);
  const serverFile = path.join(outDir, opts.serverFileName ?? DEFAULT_SERVER_FILE);
  const sampleFile = path.join(outDir, opts.sampleFileName ?? DEFAULT_SAMPLE_FILE);

  const notion = createNotionService({
    token: env.NOTION_TOKEN || "fixture",
    mock: mockNotion,
  });
  const embeddings = createEmbeddingsService({
    apiKey: env.OPENAI_API_KEY || "fixture",
    mock: mockLlm,
  });

  const projectsDbId = env.NOTION_PROJECTS_DB_ID || "fixture-db";
  const projectRefs = await notion.queryDatabase(projectsDbId, {
    categoryFilter: [...ALLOWED_PROJECT_CATEGORIES],
  });
  const filteredProjects = projectRefs.filter(
    (r) => !r.status || ALLOWED_PROJECT_STATUSES.has(r.status),
  );

  const profileIds = parseProfilePageIds(env.NOTION_PROFILE_PAGE_IDS);
  const profileRefs: NotionPageRef[] = [];
  for (const id of profileIds) {
    const ref = await notion.getPageRef(id);
    if (ref) profileRefs.push(ref);
    else console.warn(`[sync-notion] profile page skipped (not found / no access): ${id}`);
  }

  const allIds = [...filteredProjects.map((p) => p.id), ...profileRefs.map((p) => p.id)];
  const pages = await notion.getPagesContent(allIds, {
    concurrency: 4,
    onSkip: (id, reason) => console.warn(`[sync-notion] page skipped (${reason}): ${id}`),
  });

  const profileIdSet = new Set(profileIds);
  const chunks = chunkPages(pages, (p) => resolveCategory(p, profileIdSet), {
    onWarn: (msg) => console.warn(`[sync-notion] ${msg}`),
  });

  if (chunks.length === 0) {
    fail("[sync-notion] produced 0 chunks — refusing to write empty portfolio");
  }

  const texts = chunks.map((c) => c.text);
  const embeddedVectors = await embeddings.embedBatch(texts);
  for (let i = 0; i < chunks.length; i++) {
    const v = embeddedVectors[i];
    if (!v) fail(`[sync-notion] missing embedding for chunk index ${i}`);
    chunks[i]!.embedding = v;
  }

  const sortedChunks = sortChunks(chunks);
  const profile = extractProfile(pages, profileIdSet);
  const suggestedQuestions = loadSuggestedQuestions();

  const data: PortfolioServerData = {
    version: packageVersion(),
    generatedAt: nowIsoKst(),
    chunks: sortedChunks,
    suggestedQuestions,
    profile,
  };

  writeJson(serverFile, data);
  writeJson(sampleFile, makeSampleData(data));

  console.log(
    `✓ ${data.chunks.length} chunks, ${pages.length} pages, ` +
      `${data.suggestedQuestions.length} questions, generatedAt ${data.generatedAt}`,
  );
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
