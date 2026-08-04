import { fixtureEmbedding } from "@/lib/embeddings";
import { createAwsCredentialProvider } from "@/services/aws-credentials";
import type { EmbeddingsService } from "@/services/openai-embeddings";

// Bedrock Titan Text Embeddings v2 (ADR-034 Phase 2, FEAT-036).
// 네임스페이스는 ADR-029 캐시 키에 들어간다 — 모델/차원 변경 = 캐시 전량 자동 무효화.
export const TITAN_MODEL_ID = "amazon.titan-embed-text-v2:0";
export const TITAN_DIMENSIONS = 1024;
export const TITAN_NAMESPACE = `${TITAN_MODEL_ID}@${TITAN_DIMENSIONS}`;

const DEFAULT_CONCURRENCY = 4; // Titan 은 배치 API 가 없어 텍스트당 1 호출 — 동시성으로 보상
const DEFAULT_BACKOFF_MS = 1000;
const MAX_ATTEMPTS = 6;
const RETRYABLE = new Set([
  "ThrottlingException",
  "ServiceUnavailableException",
  "ModelTimeoutException",
]);

export interface BedrockEmbeddingsOptions {
  mock?: boolean;
  region?: string;
  /** 로컬 sync 용 AWS 프로필 (Lambda 는 실행 역할 = 기본 체인) */
  profile?: string;
  concurrency?: number;
  retryBackoffMs?: number;
  /** 테스트 주입용 — 텍스트 1건을 1024차원 벡터로 (기본: Bedrock InvokeModel) */
  invoke?: (text: string) => Promise<number[]>;
}

function createBedrockInvoke(opts: BedrockEmbeddingsOptions): (text: string) => Promise<number[]> {
  let clientPromise: Promise<
    import("@aws-sdk/client-bedrock-runtime").BedrockRuntimeClient
  > | null = null;
  const getClient = () => {
    // lazy import — mock/테스트 경로에서 AWS 모듈 로드 0회
    clientPromise ??= import("@aws-sdk/client-bedrock-runtime").then(
      ({ BedrockRuntimeClient }) =>
        new BedrockRuntimeClient({
          region: opts.region ?? "ap-northeast-2",
          credentials: createAwsCredentialProvider({ profile: opts.profile }),
        }),
    );
    return clientPromise;
  };
  return async (text: string) => {
    const { InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = await getClient();
    const res = await client.send(
      new InvokeModelCommand({
        modelId: TITAN_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: text, dimensions: TITAN_DIMENSIONS, normalize: true }),
      }),
    );
    const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { embedding?: number[] };
    if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== TITAN_DIMENSIONS) {
      throw new Error(
        `[bedrock-embeddings] unexpected response (dims=${parsed.embedding?.length ?? "none"})`,
      );
    }
    return parsed.embedding;
  };
}

export function createBedrockEmbeddingsService(
  opts: BedrockEmbeddingsOptions = {},
): EmbeddingsService {
  const backoffMs = opts.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const invoke = opts.invoke ?? createBedrockInvoke(opts);

  async function embedWithRetry(text: string): Promise<number[]> {
    if (opts.mock) return fixtureEmbedding(text, TITAN_DIMENSIONS);
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await invoke(text);
      } catch (err) {
        lastError = err;
        const name = err instanceof Error ? err.name : "";
        if (!RETRYABLE.has(name) || attempt === MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
  }

  return {
    embed: (text) => embedWithRetry(text),
    async embedBatch(texts) {
      // 동시성 제한 워커 풀 — 순서 보존
      const out: number[][] = new Array(texts.length);
      let next = 0;
      const worker = async () => {
        for (;;) {
          const i = next++;
          if (i >= texts.length) return;
          out[i] = await embedWithRetry(texts[i]!);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
      return out;
    },
  };
}
