import { createOpenAI } from "@ai-sdk/openai";
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

export type ModelId = "gpt-4o-mini" | "claude-3-5-haiku" | "gemini-2.0-flash";
export type Provider = "openai" | "anthropic" | "google";

export interface ModelSpec {
  id: ModelId;
  provider: Provider;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
}

export const DEFAULT_MODEL_ID: ModelId = "gpt-4o-mini";

// OpenRouter 슬러그 — "provider/model" 형식 (openrouter.ai/models 참고, ADR-026)
const OR_MODEL_ID: Record<ModelId, string> = {
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "claude-3-5-haiku": "anthropic/claude-3-5-haiku",
  "gemini-2.0-flash": "google/gemini-2.0-flash-exp",
};

const REGISTRY: Record<ModelId, ModelSpec> = {
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
  "claude-3-5-haiku": {
    id: "claude-3-5-haiku",
    provider: "anthropic",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash",
    provider: "google",
    maxOutputTokens: 1024,
    temperature: 0.3,
    topP: 0.9,
  },
};

const KNOWN_IDS = Object.keys(REGISTRY) as ModelId[];

// 이전 model ID 문자열 하위 호환 매핑 (AI Gateway 시절 ID)
const LEGACY_ID_MAP: Record<string, ModelId> = {
  "claude-3-5-haiku-latest": "claude-3-5-haiku",
  "gemini-2.0-flash-exp": "gemini-2.0-flash",
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

export function createModel(spec: ModelSpec): LanguageModel {
  const env = getServerEnv();

  if (env.MOCK_LLM === "1") {
    return createMockModel(spec.id) as unknown as LanguageModel;
  }

  if (!env.OPENROUTER_API_KEY) {
    throw new Error(
      `OPENROUTER_API_KEY is not set. ` +
        `https://openrouter.ai/keys 에서 발급 후 .env.local 에 추가. ` +
        `테스트 우회: MOCK_LLM=1`,
    );
  }

  // OpenRouter — 단일 키로 OpenAI/Anthropic/Google 라우팅 (ADR-026)
  const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const or = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: env.OPENROUTER_API_KEY,
    headers: {
      "HTTP-Referer": siteUrl,
      "X-Title": "김윤수 포트폴리오",
    },
  });
  return or(OR_MODEL_ID[spec.id]);
}

export function listAvailableModels(): ModelSpec[] {
  const env = getServerEnv();
  if (!env.OPENROUTER_API_KEY && env.MOCK_LLM !== "1") return [];
  return KNOWN_IDS.map((id) => REGISTRY[id]);
}
