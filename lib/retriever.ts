import type { PortfolioChunk, PortfolioServerData } from "@/types/portfolio";

import { cosineSimilarity, mergeScores } from "@/lib/embeddings";
import { tokenize } from "@/lib/tokenize";

export interface RetrieveOptions {
  queryEmbedding?: number[];
  keywordWeight?: number;
  vectorWeight?: number;
  topK?: number;
  maxTokens?: number;
  minVectorScore?: number;
  sortBy?: "merged" | "vector" | "keyword";
}

export interface RetrievalResult {
  chunk: PortfolioChunk;
  scores: { keyword: number; vector: number; merged: number };
}

export interface RetrievalSummary {
  results: RetrievalResult[];
  mode: "keyword-only" | "hybrid";
  empty: boolean;
}

const DEFAULTS = {
  keywordWeight: 0.4,
  vectorWeight: 0.6,
  topK: 8,
  maxTokens: 6000,
  minVectorScore: 0.3,
  sortBy: "merged" as const,
};

export function retrieve(
  query: string,
  data: PortfolioServerData,
  options: RetrieveOptions = {},
): RetrievalSummary {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0 || data.chunks.length === 0) {
    return { results: [], mode: options.queryEmbedding ? "hybrid" : "keyword-only", empty: true };
  }

  const keywordWeight = options.keywordWeight ?? DEFAULTS.keywordWeight;
  const vectorWeight = options.vectorWeight ?? DEFAULTS.vectorWeight;
  const topK = options.topK ?? DEFAULTS.topK;
  const maxTokens = options.maxTokens ?? DEFAULTS.maxTokens;
  const minVectorScore = options.minVectorScore ?? DEFAULTS.minVectorScore;
  const sortBy = options.sortBy ?? DEFAULTS.sortBy;
  const queryEmbedding = options.queryEmbedding;

  const mode: RetrievalSummary["mode"] = queryEmbedding ? "hybrid" : "keyword-only";

  if (queryEmbedding) {
    const first = data.chunks[0];
    if (first && first.embedding.length !== queryEmbedding.length) {
      throw new Error(
        `[retriever] embedding dimension mismatch: query ${queryEmbedding.length} vs chunk ${first.embedding.length}`,
      );
    }
  }

  const queryTokens = tokenize(trimmedQuery);
  const queryTokenSet = new Set(queryTokens);

  const scored: RetrievalResult[] = data.chunks.map((chunk) => {
    const keyword = scoreKeyword(chunk, queryTokenSet);
    const vector = queryEmbedding ? cosineSimilarity(chunk.embedding, queryEmbedding) : 0;
    const merged = mergeScores(keyword, vector, {
      keyword: keywordWeight,
      vector: vectorWeight,
    });
    return { chunk, scores: { keyword, vector, merged } };
  });

  const passes = scored.filter((r) => {
    if (r.scores.keyword > 0) return true;
    if (queryEmbedding && r.scores.vector >= minVectorScore) return true;
    return false;
  });

  if (passes.length === 0) {
    return { results: [], mode, empty: true };
  }

  passes.sort((a, b) => b.scores[sortBy] - a.scores[sortBy]);

  const limited = passes.slice(0, topK);

  const capped: RetrievalResult[] = [];
  let runningTokens = 0;
  for (const r of limited) {
    if (runningTokens + r.chunk.tokens > maxTokens) continue;
    capped.push(r);
    runningTokens += r.chunk.tokens;
  }

  return {
    results: capped,
    mode,
    empty: capped.length === 0,
  };
}

function scoreKeyword(chunk: PortfolioChunk, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  const haystack = collectChunkTokens(chunk);
  let matched = 0;
  for (const term of queryTokens) {
    if (haystack.has(term)) matched += 1;
  }
  return matched / queryTokens.size;
}

function collectChunkTokens(chunk: PortfolioChunk): Set<string> {
  const set = new Set<string>();
  for (const tok of tokenize(chunk.text)) set.add(tok);
  for (const heading of chunk.headingPath) {
    for (const tok of tokenize(heading)) set.add(tok);
  }
  if (chunk.tags) {
    for (const tag of chunk.tags) {
      for (const tok of tokenize(tag)) set.add(tok);
    }
  }
  return set;
}
