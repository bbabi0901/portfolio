import "server-only";

import { fixtureEmbedding } from "@/lib/embeddings";

export interface EmbeddingsServiceOptions {
  apiKey: string;
  mock?: boolean;
  baseURL?: string;
  model?: string;
  dimensions?: number;
  maxBatchSize?: number;
  retryBackoffMs?: number;
}

export interface EmbeddingsService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

interface EmbeddingResponse {
  data: Array<{ index?: number; embedding: number[] }>;
}

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_MAX_BATCH = 96;
const DEFAULT_BACKOFF_MS = 250;
const MAX_ATTEMPTS = 4;

class Service implements EmbeddingsService {
  private readonly apiKey: string;
  private readonly mock: boolean;
  private readonly baseURL: string;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly maxBatchSize: number;
  private readonly backoffMs: number;

  constructor(opts: EmbeddingsServiceOptions) {
    this.apiKey = opts.apiKey;
    this.mock = !!opts.mock;
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = opts.model ?? DEFAULT_MODEL;
    this.dimensions = opts.dimensions ?? DEFAULT_DIMENSIONS;
    this.maxBatchSize = Math.max(1, opts.maxBatchSize ?? DEFAULT_MAX_BATCH);
    this.backoffMs = opts.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
  }

  async embed(text: string): Promise<number[]> {
    const out = await this.embedBatch([text]);
    return out[0] ?? new Array(this.dimensions).fill(0);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.mock) {
      return texts.map((t) => fixtureEmbedding(t, this.dimensions));
    }
    const out: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const slice = texts.slice(i, i + this.maxBatchSize);
      const vectors = await this.callOpenAI(slice);
      for (let j = 0; j < vectors.length; j++) {
        out[i + j] = vectors[j]!;
      }
    }
    return out;
  }

  private async callOpenAI(inputs: string[]): Promise<number[][]> {
    const url = `${this.baseURL}/v1/embeddings`;
    const body = JSON.stringify({
      model: this.model,
      input: inputs,
      dimensions: this.dimensions,
    });

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body,
        });
      } catch (err) {
        lastErr = err as Error;
        await sleep(this.backoffMs * 2 ** attempt);
        continue;
      }

      if (res.status === 429 || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
        if (res.status === 429) {
          if (attempt === MAX_ATTEMPTS - 1) {
            throw new Error(`OpenAI embeddings rate-limited after ${MAX_ATTEMPTS} attempts`);
          }
          await sleep(this.backoffMs * 2 ** attempt);
          continue;
        }
        const text = await safeText(res);
        throw new Error(`OpenAI embeddings ${res.status}: ${text}`);
      }
      if (res.status === 401) {
        const text = await safeText(res);
        throw new Error(`OpenAI embeddings unauthorized: ${text}`);
      }
      if (res.status >= 500) {
        const text = await safeText(res);
        throw new Error(`OpenAI embeddings server error ${res.status}: ${text}`);
      }
      if (!res.ok) {
        const text = await safeText(res);
        throw new Error(`OpenAI embeddings failed ${res.status}: ${text}`);
      }

      const json = (await res.json()) as EmbeddingResponse;
      const items = (json.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return items.map((d) => d.embedding);
    }

    throw lastErr ?? new Error("OpenAI embeddings: unreachable");
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export function createEmbeddingsService(opts: EmbeddingsServiceOptions): EmbeddingsService {
  if (!opts.apiKey) {
    throw new Error("createEmbeddingsService: apiKey is required");
  }
  return new Service(opts);
}
