import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { PortfolioChunk, PortfolioClientData, PortfolioServerData } from "@/types/portfolio";

/**
 * 커밋 데이터 로더 (ADR-030 → ADR-038 슬림 폴백 개정, FEAT-040).
 * 우선순위: portfolio.server.json(로컬 sync 산출물·CI fixture, 임베딩 포함, git 미커밋)
 *   → portfolio.fallback.json(커밋본 — 임베딩 제외 슬림, S3 corpus 장애 시 런타임 폴백)
 *   → portfolio.sample.json(mini 샘플, CI 안전망).
 * 임베딩 없는 청크는 embedding=[] 로 채운다 — 벡터 점수는 S3 Vectors(vectorScores)가 공급.
 */

const SERVER_FILE = "portfolio.server.json";
const FALLBACK_FILE = "portfolio.fallback.json";
const SAMPLE_FILE = "portfolio.sample.json";

let cached: PortfolioServerData | null = null;

export function loadPortfolio(): PortfolioServerData {
  if (cached) return cached;
  cached = loadPortfolioFrom(path.join(process.cwd(), "data"));
  return cached;
}

/** 테스트 주입용 — 캐시 없이 지정 디렉토리에서 로드. */
export function loadPortfolioFrom(dir: string): PortfolioServerData {
  let source: string | null = null;
  let raw: string | null = null;

  for (const name of [SERVER_FILE, FALLBACK_FILE, SAMPLE_FILE]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      source = p;
      raw = fs.readFileSync(p, "utf8");
      break;
    }
  }

  if (raw === null || source === null) {
    throw new Error(
      `[portfolio-data] ${SERVER_FILE}/${FALLBACK_FILE}/${SAMPLE_FILE} 모두 없음 (${dir}). Run \`npm run sync:notion\` first.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[portfolio-data] failed to parse ${source}: ${(err as Error).message}`);
  }

  return assertPortfolioServerData(parsed, source);
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
  // 슬림 폴백은 임베딩 미보유 (ADR-038) — 있으면 배열이어야 하고, 없으면 [] 로 채운다
  if (value.embedding !== undefined && !Array.isArray(value.embedding)) {
    throw new Error(`[portfolio-data] ${source}: chunks[${index}].embedding must be array`);
  }
  const chunk = value as unknown as PortfolioChunk;
  if (value.embedding === undefined) {
    return { ...chunk, embedding: [] };
  }
  return chunk;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
