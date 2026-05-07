#!/usr/bin/env node
import "server-only";

import fs from "node:fs";
import path from "node:path";

import { loadPortfolio } from "@/lib/portfolio-data";
import { tokenize } from "@/lib/tokenize";
import type {
  PortfolioChunk,
  PortfolioClientData,
  PortfolioServerData,
  SuggestedQuestionMeta,
} from "@/types/portfolio";

export interface GenerateOptions {
  /** Optional input JSON path. When omitted, loadPortfolio() is used. */
  inFile?: string;
  /** Output path. Default: public/data/suggestions.json. */
  outFile?: string;
  /** Total cap for suggested questions (default 30). */
  maxTotal?: number;
}

const DEFAULT_OUT_FILE = "public/data/suggestions.json";
const DEFAULT_MAX_TOTAL = 30;
const AUTO_ID_START = 100;
const RELATED_TOP_N = 3;
const PERSONAL_KEYWORDS: ReadonlyArray<{ keyword: string; question: string }> = [
  { keyword: "MBTI", question: "MBTI가 어떻게 돼요?" },
  { keyword: "성격", question: "성격이 어때요?" },
  { keyword: "취미", question: "취미가 뭐예요?" },
];

function readPortfolio(inFile: string | undefined): PortfolioServerData {
  if (!inFile) return loadPortfolio();
  const abs = path.isAbsolute(inFile) ? inFile : path.join(process.cwd(), inFile);
  if (!fs.existsSync(abs)) {
    throw new Error(`[generate-suggestions] input not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const parsed = JSON.parse(raw) as PortfolioServerData;
  if (!Array.isArray(parsed.chunks)) {
    throw new Error(`[generate-suggestions] ${abs}: chunks must be array`);
  }
  if (!Array.isArray(parsed.suggestedQuestions)) {
    throw new Error(`[generate-suggestions] ${abs}: suggestedQuestions must be array`);
  }
  if (!parsed.profile) {
    throw new Error(`[generate-suggestions] ${abs}: profile required`);
  }
  return parsed;
}

function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s.,!?;:'"()[\]{}<>~`@#$%^&*\-_=+/\\|]+/g, "");
}

function generateAutoQuestions(
  chunks: PortfolioChunk[],
  coreQuestions: SuggestedQuestionMeta[],
): SuggestedQuestionMeta[] {
  const auto: SuggestedQuestionMeta[] = [];
  let counter = AUTO_ID_START;
  const nextId = (): string => `Q-${String(counter++).padStart(3, "0")}`;

  const triggeredKeywords = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.category !== "personal") continue;
    const pathText = chunk.headingPath.join(" ");
    for (const { keyword, question } of PERSONAL_KEYWORDS) {
      if (triggeredKeywords.has(keyword)) continue;
      if (!pathText.includes(keyword)) continue;
      triggeredKeywords.add(keyword);
      auto.push({
        id: nextId(),
        category: "personal",
        text: question,
        expectedSourceTitles: [chunk.sourceTitle],
      });
    }
  }

  const coreTitles = new Set<string>();
  for (const q of coreQuestions) {
    for (const t of q.expectedSourceTitles ?? []) coreTitles.add(t);
  }
  const seenProjectTitles = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.category !== "project") continue;
    if (coreTitles.has(chunk.sourceTitle)) continue;
    if (seenProjectTitles.has(chunk.sourceTitle)) continue;
    seenProjectTitles.add(chunk.sourceTitle);
    auto.push({
      id: nextId(),
      category: "project",
      text: `${chunk.sourceTitle} 어떻게 만들었어요?`,
      expectedSourceTitles: [chunk.sourceTitle],
    });
  }

  return auto;
}

function dedupeAndCap(
  primary: SuggestedQuestionMeta[],
  auto: SuggestedQuestionMeta[],
  maxTotal: number,
): SuggestedQuestionMeta[] {
  const result: SuggestedQuestionMeta[] = [];
  const seen = new Set<string>();
  const append = (q: SuggestedQuestionMeta): boolean => {
    const key = normalizeQuestionText(q.text);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    result.push({ ...q, text: q.text.trim() });
    return result.length < maxTotal;
  };
  for (const q of primary) {
    if (result.length >= maxTotal) break;
    append(q);
  }
  for (const q of auto) {
    if (result.length >= maxTotal) break;
    append(q);
  }
  return result;
}

function buildRelatedMap(
  chunks: PortfolioChunk[],
  questions: SuggestedQuestionMeta[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const chunk of chunks) {
    const chunkSignal = new Set<string>();
    for (const t of tokenize(chunk.headingPath.join(" "))) chunkSignal.add(t);
    for (const t of chunk.tags ?? []) chunkSignal.add(t.toLowerCase());
    if (chunk.sourceTitle) {
      for (const t of tokenize(chunk.sourceTitle)) chunkSignal.add(t);
    }

    const scored: Array<{ id: string; score: number; index: number }> = [];
    questions.forEach((q, index) => {
      const qTokens = tokenize(q.text);
      let score = 0;
      for (const t of qTokens) {
        if (chunkSignal.has(t)) score++;
      }
      if (chunk.sourceTitle && (q.expectedSourceTitles ?? []).includes(chunk.sourceTitle)) {
        score += 2;
      }
      if (score > 0) scored.push({ id: q.id, score, index });
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    map[chunk.id] = scored.slice(0, RELATED_TOP_N).map((s) => s.id);
  }
  return map;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function main(opts: GenerateOptions = {}): Promise<void> {
  const data = readPortfolio(opts.inFile);
  const maxTotal = opts.maxTotal ?? DEFAULT_MAX_TOTAL;

  const auto = generateAutoQuestions(data.chunks, data.suggestedQuestions);
  const merged = dedupeAndCap(data.suggestedQuestions, auto, maxTotal);
  const relatedQuestions = buildRelatedMap(data.chunks, merged);

  const output: PortfolioClientData = {
    version: data.version,
    generatedAt: data.generatedAt,
    suggestedQuestions: merged,
    profile: data.profile,
    relatedQuestions,
  };

  const outFile = opts.outFile
    ? path.isAbsolute(opts.outFile)
      ? opts.outFile
      : path.join(process.cwd(), opts.outFile)
    : path.join(process.cwd(), DEFAULT_OUT_FILE);

  writeJson(outFile, output);

  const coreCount = merged.filter((q) => /^Q-0(0[1-9]|1[0-8])$/.test(q.id)).length;
  const autoCount = merged.length - coreCount;
  console.log(
    `✓ ${merged.length} questions (${coreCount} core + ${autoCount} auto), ${data.chunks.length} chunks mapped → ${path.relative(process.cwd(), outFile)}`,
  );
}

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const resolved = path.resolve(entry);
  return (
    resolved.endsWith("generate-suggestions.ts") ||
    resolved.endsWith("generate-suggestions.js")
  );
})();

if (isDirectRun) {
  main().catch((err: Error) => {
    console.error(err.message ?? String(err));
    process.exit(1);
  });
}
