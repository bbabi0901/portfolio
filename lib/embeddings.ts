export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dimension mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  if (sum === 0) return [...v];
  const n = Math.sqrt(sum);
  return v.map((x) => x / n);
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

export function fixtureEmbedding(text: string, dimensions = 1536): number[] {
  let state = hashString(text);
  if (state === 0) state = 1;
  const v: number[] = new Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    v[i] = state / 0x100000000 - 0.5;
  }
  return normalize(v);
}

export interface MergeWeights {
  keyword: number;
  vector: number;
}

const DEFAULT_WEIGHTS: MergeWeights = { keyword: 0.4, vector: 0.6 };

export function mergeScores(
  keyword: number,
  vector: number,
  weights: MergeWeights = DEFAULT_WEIGHTS,
): number {
  const clamped = Math.max(0, vector);
  return weights.keyword * keyword + weights.vector * clamped;
}
