import type { PortfolioChunk, PortfolioServerData } from "@/types/portfolio";

import { cosineSimilarity, mergeScores } from "@/lib/embeddings";
import { tokenize } from "@/lib/tokenize";

export interface RetrieveOptions {
  queryEmbedding?: number[];
  /** 외부 벡터 검색(S3 Vectors) 결과 주입 — chunkId → cosine similarity. queryEmbedding 과 양자택일 (ADR-034 Phase 3) */
  vectorScores?: Map<string, number>;
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
  // Titan v2 실측 캘리브레이션 (EC-54): 정답 대역 0.16~0.42, 무관 질의 노이즈 상단 0.216.
  // 구 0.3 은 Voyage 시절 값 — 테니스(0.277)급 정답을 차단했다. 0.25 = 노이즈와 분리되는 하한.
  minVectorScore: 0.25,
  sortBy: "merged" as const,
};

export function retrieve(
  query: string,
  data: PortfolioServerData,
  options: RetrieveOptions = {},
): RetrievalSummary {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0 || data.chunks.length === 0) {
    return {
      results: [],
      mode: options.queryEmbedding || options.vectorScores ? "hybrid" : "keyword-only",
      empty: true,
    };
  }

  const keywordWeight = options.keywordWeight ?? DEFAULTS.keywordWeight;
  const vectorWeight = options.vectorWeight ?? DEFAULTS.vectorWeight;
  const topK = options.topK ?? DEFAULTS.topK;
  const maxTokens = options.maxTokens ?? DEFAULTS.maxTokens;
  const minVectorScore = options.minVectorScore ?? DEFAULTS.minVectorScore;
  const sortBy = options.sortBy ?? DEFAULTS.sortBy;
  const queryEmbedding = options.queryEmbedding;
  const vectorScores = options.vectorScores;
  const hasVector = Boolean(queryEmbedding || vectorScores);

  const mode: RetrievalSummary["mode"] = hasVector ? "hybrid" : "keyword-only";

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
    const vector = queryEmbedding
      ? cosineSimilarity(chunk.embedding, queryEmbedding)
      : (vectorScores?.get(chunk.id) ?? 0);
    const merged = mergeScores(keyword, vector, {
      keyword: keywordWeight,
      vector: vectorWeight,
    });
    return { chunk, scores: { keyword, vector, merged } };
  });

  const passes = scored.filter((r) => {
    if (r.scores.keyword > 0) return true;
    if (hasVector && r.scores.vector >= minVectorScore) return true;
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
    if (haystack.has(term)) {
      matched += 1;
      continue;
    }
    // 복합명사 부분일치 (EC-54): "대학교" ⊂ "고려대학교", "개발" ⊂ "개발자" — 토큰은 이미 2자 이상
    for (const tok of haystack) {
      if (tok.length > term.length && tok.includes(term)) {
        matched += 1;
        break;
      }
    }
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
