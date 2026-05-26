import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { PortfolioChunk, PortfolioClientData, PortfolioServerData } from "@/types/portfolio";

const SERVER_FILE = "data/portfolio.server.json";
const SAMPLE_FILE = "data/portfolio.sample.json";

let cached: PortfolioServerData | null = null;

export function loadPortfolio(): PortfolioServerData {
  if (cached) return cached;

  const cwd = process.cwd();
  const serverPath = path.join(cwd, SERVER_FILE);
  const samplePath = path.join(cwd, SAMPLE_FILE);

  let source: string | null = null;
  let raw: string | null = null;

  if (fs.existsSync(serverPath)) {
    source = serverPath;
    raw = fs.readFileSync(serverPath, "utf8");
  } else if (fs.existsSync(samplePath)) {
    source = samplePath;
    raw = fs.readFileSync(samplePath, "utf8");
  }

  if (raw === null || source === null) {
    throw new Error(
      `[portfolio-data] neither ${SERVER_FILE} nor ${SAMPLE_FILE} found. Run \`npm run sync:notion\` first.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[portfolio-data] failed to parse ${source}: ${(err as Error).message}`);
  }

  const data = assertPortfolioServerData(parsed, source);
  cached = data;
  return data;
}

export function clearPortfolioCache(): void {
  cached = null;
}

export function toClientData(data: PortfolioServerData): PortfolioClientData {
  return {
    version: data.version,
    generatedAt: data.generatedAt,
    suggestedQuestions: data.suggestedQuestions,
    profile: data.profile,
  };
}

function assertPortfolioServerData(value: unknown, source: string): PortfolioServerData {
  if (!isObject(value)) {
    throw new Error(`[portfolio-data] ${source}: root must be object`);
  }
  if (typeof value.version !== "string") {
    throw new Error(`[portfolio-data] ${source}: version must be string`);
  }
  if (typeof value.generatedAt !== "string") {
    throw new Error(`[portfolio-data] ${source}: generatedAt must be string`);
  }
  if (!Array.isArray(value.chunks)) {
    throw new Error(`[portfolio-data] ${source}: chunks must be array`);
  }
  const chunks = value.chunks.map((c, i) => assertChunk(c, i, source));
  if (!Array.isArray(value.suggestedQuestions)) {
    throw new Error(`[portfolio-data] ${source}: suggestedQuestions must be array`);
  }
  if (!isObject(value.profile)) {
    throw new Error(`[portfolio-data] ${source}: profile must be object`);
  }
  return {
    version: value.version,
    generatedAt: value.generatedAt,
    chunks,
    suggestedQuestions: value.suggestedQuestions as PortfolioServerData["suggestedQuestions"],
    profile: value.profile as unknown as PortfolioServerData["profile"],
  };
}

function assertChunk(value: unknown, index: number, source: string): PortfolioChunk {
  if (!isObject(value)) {
    throw new Error(`[portfolio-data] ${source}: chunks[${index}] not object`);
  }
  const requiredStrings = [
    "id",
    "sourcePageId",
    "sourceTitle",
    "sourceUrl",
    "category",
    "text",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof value[key] !== "string") {
      throw new Error(`[portfolio-data] ${source}: chunks[${index}].${key} must be string`);
    }
  }
  if (typeof value.tokens !== "number") {
    throw new Error(`[portfolio-data] ${source}: chunks[${index}].tokens must be number`);
  }
  if (!Array.isArray(value.headingPath)) {
    throw new Error(`[portfolio-data] ${source}: chunks[${index}].headingPath must be array`);
  }
  if (!Array.isArray(value.embedding) || value.embedding.length === 0) {
    throw new Error(
      `[portfolio-data] ${source}: chunks[${index}].embedding must be non-empty array`,
    );
  }
  return value as unknown as PortfolioChunk;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
