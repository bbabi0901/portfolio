import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import type { LanguageModel } from "ai";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { createAwsCredentialProvider } from "@/services/aws-credentials";
import { getServerEnv } from "./env";

export type ModelId = "nova-lite" | "nova-micro" | "claude-haiku";
export type Provider = "amazon" | "anthropic";

export interface ModelSpec {
  id: ModelId;
  provider: Provider;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
}

// 비용 최소화 우선 (ADR-034): Nova Lite $0.06/$0.24 per 1M tok 기본,
// Claude Haiku 는 품질 옵션. 서울 리전 미보유 모델 대비 APAC 교차 리전
// inference profile(apac.) ID 사용 — 정확한 가용성은 test:smoke 로 검증.
export const DEFAULT_MODEL_ID: ModelId = "nova-lite";

const BEDROCK_MODEL_ID: Record<ModelId, string> = {
  "nova-lite": "apac.amazon.nova-lite-v1:0",
  "nova-micro": "apac.amazon.nova-micro-v1:0",
  "claude-haiku": "apac.anthropic.claude-haiku-4-5-20251001-v1:0",
};

const REGISTRY: Record<ModelId, ModelSpec> = {
  "nova-lite": {
    id: "nova-lite",
    provider: "amazon",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
  "nova-micro": {
    id: "nova-micro",
    provider: "amazon",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
  "claude-haiku": {
    id: "claude-haiku",
    provider: "anthropic",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
};

const KNOWN_IDS = Object.keys(REGISTRY) as ModelId[];

// 이전 model ID 문자열 하위 호환 매핑 — OpenRouter 시절(ADR-026) ID 는
// localStorage 에 저장돼 있을 수 있어 substitution 없이 흡수한다.
const LEGACY_ID_MAP: Record<string, ModelId> = {
  "gpt-4o-mini": "nova-lite",
  "gemini-2.0-flash": "nova-lite",
  "gemini-2.0-flash-exp": "nova-lite",
  "claude-3-5-haiku": "claude-haiku",
  "claude-3-5-haiku-latest": "claude-haiku",
};

export function isKnownModel(id: string): id is ModelId {
  return (KNOWN_IDS as string[]).includes(id) || id in LEGACY_ID_MAP;
}

export function resolveModel(id: string | null | undefined): ModelSpec {
  const normalized = id != null ? (LEGACY_ID_MAP[id] ?? id) : null;
  if (normalized != null && (KNOWN_IDS as string[]).includes(normalized)) {
    return REGISTRY[normalized as ModelId];
  }
  if (id != null) {
    console.warn("[models] unknown model id %s, falling back to %s", id, DEFAULT_MODEL_ID);
  }
  return REGISTRY[DEFAULT_MODEL_ID];
}

function lastUserText(prompt: LanguageModelV3CallOptions["prompt"]): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (!msg || msg.role !== "user") continue;
    const parts = msg.content;
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
    if (text) return text;
  }
  return "";
}

const MOCK_FINISH: LanguageModelV3FinishReason = { unified: "stop", raw: "stop" };
const MOCK_USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 50, text: 50, reasoning: 0 },
};

function createMockModel(modelId: ModelId): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "mock",
    modelId,
    supportedUrls: {},
    async doGenerate(options): Promise<LanguageModelV3GenerateResult> {
      const echo = `[mock-llm] ${lastUserText(options.prompt)}`;
      return {
        content: [{ type: "text", text: echo }],
        finishReason: MOCK_FINISH,
        usage: MOCK_USAGE,
        warnings: [],
      };
    },
    async doStream(options): Promise<LanguageModelV3StreamResult> {
      const echo = `[mock-llm] ${lastUserText(options.prompt)}`;
      const id = "mock-1";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id });
          controller.enqueue({ type: "text-delta", id, delta: echo });
          controller.enqueue({ type: "text-end", id });
          controller.enqueue({
            type: "finish",
            usage: MOCK_USAGE,
            finishReason: MOCK_FINISH,
          });
          controller.close();
        },
      });
      return { stream };
    },
  };
}

/** Bedrock 호출 가능 여부 — Vercel OIDC 역할 또는 로컬 AWS 프로필 (ADR-034) */
function hasAwsAccess(env: ReturnType<typeof getServerEnv>): boolean {
  return Boolean(env.PORTFOLIO_AWS_ROLE_ARN || env.PORTFOLIO_AWS_PROFILE);
}

export function createModel(spec: ModelSpec): LanguageModel {
  const env = getServerEnv();

  if (env.MOCK_LLM === "1") {
    return createMockModel(spec.id) as unknown as LanguageModel;
  }

  if (!hasAwsAccess(env)) {
    throw new Error(
      `AWS 자격 증명이 없습니다. Vercel 은 PORTFOLIO_AWS_ROLE_ARN(OIDC), ` +
        `로컬은 PORTFOLIO_AWS_PROFILE 을 설정하세요 (ADR-034). ` +
        `테스트 우회: MOCK_LLM=1`,
    );
  }

  // Amazon Bedrock Converse — 챗 LLM (ADR-034, ADR-026 대체)
  const bedrock = createAmazonBedrock({
    region: env.PORTFOLIO_AWS_REGION,
    credentialProvider: createAwsCredentialProvider({
      roleArn: env.PORTFOLIO_AWS_ROLE_ARN,
      profile: env.PORTFOLIO_AWS_PROFILE,
    }),
  });
  return bedrock(BEDROCK_MODEL_ID[spec.id]);
}

export function listAvailableModels(): ModelSpec[] {
  const env = getServerEnv();
  if (!hasAwsAccess(env) && env.MOCK_LLM !== "1") return [];
  return KNOWN_IDS.map((id) => REGISTRY[id]);
}
