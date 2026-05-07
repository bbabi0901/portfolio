import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { getServerEnv } from "./env";

export type ModelId = "gpt-4o-mini" | "claude-3-5-haiku-latest" | "gemini-2.0-flash-exp";
export type Provider = "openai" | "anthropic" | "google";

export interface ModelSpec {
  id: ModelId;
  provider: Provider;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
}

export const DEFAULT_MODEL_ID: ModelId = "gpt-4o-mini";

const REGISTRY: Record<ModelId, ModelSpec> = {
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
  "claude-3-5-haiku-latest": {
    id: "claude-3-5-haiku-latest",
    provider: "anthropic",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
  "gemini-2.0-flash-exp": {
    id: "gemini-2.0-flash-exp",
    provider: "google",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
};

const KNOWN_IDS = Object.keys(REGISTRY) as ModelId[];

export function isKnownModel(id: string): id is ModelId {
  return (KNOWN_IDS as string[]).includes(id);
}

export function resolveModel(id: string | null | undefined): ModelSpec {
  if (id != null && isKnownModel(id)) {
    return REGISTRY[id];
  }
  if (id != null) {
    console.warn(
      "[models] unknown model id %s, falling back to %s",
      id,
      DEFAULT_MODEL_ID,
    );
  }
  return REGISTRY[DEFAULT_MODEL_ID];
}

const PROVIDER_ENV_KEY: Record<Provider, keyof ReturnType<typeof getServerEnv>> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

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

export function createModel(spec: ModelSpec): LanguageModel {
  const env = getServerEnv();
  if (env.MOCK_LLM === "1") {
    return createMockModel(spec.id);
  }
  const envKey = PROVIDER_ENV_KEY[spec.provider];
  const apiKey = env[envKey];
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error(`provider:${spec.provider} API key not set`);
  }
  switch (spec.provider) {
    case "openai":
      return createOpenAI({ apiKey })(spec.id);
    case "anthropic":
      return createAnthropic({ apiKey })(spec.id);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(spec.id);
  }
}

export function listAvailableModels(): ModelSpec[] {
  const env = getServerEnv();
  return KNOWN_IDS.map((id) => REGISTRY[id]).filter((spec) => {
    const envKey = PROVIDER_ENV_KEY[spec.provider];
    return typeof env[envKey] === "string" && env[envKey] !== "";
  });
}
