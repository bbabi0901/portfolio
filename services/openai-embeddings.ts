import "server-only";

import { fixtureEmbedding } from "@/lib/embeddings";

export interface EmbeddingsServiceOptions {
  apiKey: string;
  mock?: boolean;
  baseURL?: string;
  model?: string;
  dimensions?: number;
  /** true 시 요청 바디에서 dimensions 필드 제외 (Voyage AI 등 미지원 API용) */
  omitDimensions?: boolean;
  maxBatchSize?: number;
  retryBackoffMs?: number;
  /** 배치 간 대기 ms (rate limit 사전 방지용, 기본 0) */
  batchDelayMs?: number;
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
const MAX_ATTEMPTS = 6; // free tier: 3 RPM → 최대 60s 대기 필요

// Voyage AI 프리셋 — OpenRouter 미지원 임베딩 대안 (무료 50M tokens/월)
// https://docs.voyageai.com/reference/embeddings-api
export const VOYAGE_PRESET: Partial<EmbeddingsServiceOptions> = {
  baseURL: "https://api.voyageai.com",
  model: "voyage-3-lite",
  dimensions: 1024,
  omitDimensions: true, // Voyage API는 dimensions 파라미터 미지원
  maxBatchSize: 8, // free tier TPM 제한 방지
  batchDelayMs: 2000, // 배치 간 2s 딜레이로 rate limit 사전 방지
  retryBackoffMs: 2000, // 429 시 2s→4s→8s... 대기
};

class Service implements EmbeddingsService {
  private readonly apiKey: string;
  private readonly mock: boolean;
  private readonly baseURL: string;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly omitDimensions: boolean;
  private readonly maxBatchSize: number;
  private readonly backoffMs: number;
  private readonly batchDelayMs: number;

  constructor(opts: EmbeddingsServiceOptions) {
    this.apiKey = opts.apiKey;
    this.mock = !!opts.mock;
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = opts.model ?? DEFAULT_MODEL;
    this.dimensions = opts.dimensions ?? DEFAULT_DIMENSIONS;
    this.omitDimensions = !!opts.omitDimensions;
    this.maxBatchSize = Math.max(1, opts.maxBatchSize ?? DEFAULT_MAX_BATCH);
    this.backoffMs = opts.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
    this.batchDelayMs = opts.batchDelayMs ?? 0;
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
      if (i > 0 && this.batchDelayMs > 0) await sleep(this.batchDelayMs);
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
    const bodyObj: Record<string, unknown> = { model: this.model, input: inputs };
    if (!this.omitDimensions) bodyObj.dimensions = this.dimensions;
    const body = JSON.stringify(bodyObj);

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
          // Retry-After 헤더 우선, 없으면 지수 백오프
          // OpenAI 무료 티어(3 RPM) 대비 minWait 20s; 테스트(backoffMs=1)는 0
          const retryAfter = res.headers.get("retry-after");
          const expBackoff = this.backoffMs * 2 ** attempt;
          const minWaitMs = this.backoffMs >= 10_000 ? 20_000 : 0;
          const waitMs = retryAfter ? Number(retryAfter) * 1000 : Math.max(expBackoff, minWaitMs);
          console.warn(
            `[embeddings] rate-limited, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
          );
          await sleep(waitMs);
          continue;
        }
        const text = await safeText(res);
        throw new Error(`OpenAI embeddings ${res.status}: ${text}`);
      }
      if (res.status === 401) {
        const text = await safeText(res);
        throw new Error(`Embeddings unauthorized: ${text}`);
      }
      if (res.status >= 500) {
        const text = await safeText(res);
        throw new Error(`Embeddings server error ${res.status}: ${text}`);
      }
      if (!res.ok) {
        const text = await safeText(res);
        throw new Error(`Embeddings failed ${res.status}: ${text}`);
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
