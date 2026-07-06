import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateText } from "ai";
import {
  DEFAULT_MODEL_ID,
  isKnownModel,
  resolveModel,
  createModel,
  listAvailableModels,
} from "@/lib/models";
import { clearEnvCache } from "@/lib/env";

const ENV_KEYS = ["OPENROUTER_API_KEY", "MOCK_LLM"] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  clearEnvCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
  vi.restoreAllMocks();
});

describe("resolveModel", () => {
  it("알 수 없는 ID → DEFAULT_MODEL_ID 로 강등 + console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spec = resolveModel("not-a-real-model");
    expect(spec.id).toBe(DEFAULT_MODEL_ID);
    expect(warn).toHaveBeenCalled();
  });

  it("null → DEFAULT_MODEL_ID", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveModel(null).id).toBe(DEFAULT_MODEL_ID);
  });

  it("undefined → DEFAULT_MODEL_ID", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveModel(undefined).id).toBe(DEFAULT_MODEL_ID);
  });

  it("known ID → 해당 spec 반환 (warn 없음)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spec = resolveModel("claude-3-5-haiku");
    expect(spec.id).toBe("claude-3-5-haiku");
    expect(spec.provider).toBe("anthropic");
    expect(spec.maxOutputTokens).toBe(1024);
    expect(spec.temperature).toBe(0.3);
    expect(spec.topP).toBe(0.9);
    expect(warn).not.toHaveBeenCalled();
  });

  it("레거시 ID (haiku-latest) → 새 ID 정규화", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spec = resolveModel("claude-3-5-haiku-latest");
    expect(spec.id).toBe("claude-3-5-haiku");
    expect(warn).not.toHaveBeenCalled();
  });

  it("레거시 ID (flash-exp) → 새 ID 정규화", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spec = resolveModel("gemini-2.0-flash-exp");
    expect(spec.id).toBe("gemini-2.0-flash");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isKnownModel", () => {
  it("화이트리스트 3종 모두 true", () => {
    expect(isKnownModel("gpt-4o-mini")).toBe(true);
    expect(isKnownModel("claude-3-5-haiku")).toBe(true);
    expect(isKnownModel("gemini-2.0-flash")).toBe(true);
  });

  it("레거시 ID 도 true (하위 호환)", () => {
    expect(isKnownModel("claude-3-5-haiku-latest")).toBe(true);
    expect(isKnownModel("gemini-2.0-flash-exp")).toBe(true);
  });

  it("임의 문자열 false", () => {
    expect(isKnownModel("gpt-5")).toBe(false);
    expect(isKnownModel("")).toBe(false);
    expect(isKnownModel("anything")).toBe(false);
  });
});

describe("listAvailableModels", () => {
  it("OPENROUTER_API_KEY 부재 시 빈 배열", () => {
    expect(listAvailableModels()).toEqual([]);
  });

  it("OPENROUTER_API_KEY 있으면 3개 모델 모두 노출", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    clearEnvCache();
    const models = listAvailableModels();
    expect(models).toHaveLength(3);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("gpt-4o-mini");
    expect(ids).toContain("claude-3-5-haiku");
    expect(ids).toContain("gemini-2.0-flash");
  });
});

describe("createModel", () => {
  it("OPENROUTER_API_KEY 부재 시 throw", () => {
    const spec = resolveModel("gpt-4o-mini");
    expect(() => createModel(spec)).toThrow(/OPENROUTER_API_KEY/);
  });

  it("OPENROUTER_API_KEY 있으면 LanguageModel 인스턴스 반환 (실제 호출 X)", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    clearEnvCache();
    const spec = resolveModel("gpt-4o-mini");
    const model = createModel(spec);
    expect(model).toBeDefined();
    expect(typeof model).toBe("object");
  });

  it("MOCK_LLM=1 시 mock 모델 반환 + generateText 결정적 echo", async () => {
    process.env.MOCK_LLM = "1";
    clearEnvCache();
    const spec = resolveModel("gpt-4o-mini");
    const model = createModel(spec);
    const result = await generateText({
      model,
      prompt: "Hello, world!",
    });
    expect(result.text).toContain("[mock-llm]");
    expect(result.text).toContain("Hello, world!");
  });
});
