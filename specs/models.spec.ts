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

const ENV_KEYS = [
  "PORTFOLIO_AWS_ROLE_ARN",
  "PORTFOLIO_AWS_PROFILE",
  "PORTFOLIO_AWS_REGION",
  "MOCK_LLM",
] as const;

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
    const spec = resolveModel("claude-haiku");
    expect(spec.id).toBe("claude-haiku");
    expect(spec.provider).toBe("anthropic");
    expect(spec.maxOutputTokens).toBe(1024);
    expect(spec.temperature).toBe(0.3);
    expect(spec.topP).toBe(0.9);
    expect(warn).not.toHaveBeenCalled();
  });

  it("기본 모델은 Nova Lite (비용 최소화, ADR-034)", () => {
    expect(DEFAULT_MODEL_ID).toBe("nova-lite");
    expect(resolveModel("nova-lite").provider).toBe("amazon");
  });

  it("레거시 OpenRouter ID (gpt-4o-mini) → nova-lite 정규화 (substitution 없음)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spec = resolveModel("gpt-4o-mini");
    expect(spec.id).toBe("nova-lite");
    expect(warn).not.toHaveBeenCalled();
  });

  it("레거시 ID (claude-3-5-haiku, -latest) → claude-haiku 정규화", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveModel("claude-3-5-haiku").id).toBe("claude-haiku");
    expect(resolveModel("claude-3-5-haiku-latest").id).toBe("claude-haiku");
    expect(warn).not.toHaveBeenCalled();
  });

  it("레거시 ID (gemini-2.0-flash, -exp) → nova-lite 정규화", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveModel("gemini-2.0-flash").id).toBe("nova-lite");
    expect(resolveModel("gemini-2.0-flash-exp").id).toBe("nova-lite");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isKnownModel", () => {
  it("Bedrock 레지스트리 3종 모두 true", () => {
    expect(isKnownModel("nova-lite")).toBe(true);
    expect(isKnownModel("nova-micro")).toBe(true);
    expect(isKnownModel("claude-haiku")).toBe(true);
  });

  it("레거시 ID 도 true (하위 호환 — localStorage 저장분 흡수)", () => {
    expect(isKnownModel("gpt-4o-mini")).toBe(true);
    expect(isKnownModel("claude-3-5-haiku")).toBe(true);
    expect(isKnownModel("claude-3-5-haiku-latest")).toBe(true);
    expect(isKnownModel("gemini-2.0-flash")).toBe(true);
    expect(isKnownModel("gemini-2.0-flash-exp")).toBe(true);
  });

  it("임의 문자열 false", () => {
    expect(isKnownModel("gpt-5")).toBe(false);
    expect(isKnownModel("")).toBe(false);
    expect(isKnownModel("anything")).toBe(false);
  });
});

describe("listAvailableModels", () => {
  it("AWS 자격 증명 경로 부재 시 빈 배열", () => {
    expect(listAvailableModels()).toEqual([]);
  });

  it("PORTFOLIO_AWS_ROLE_ARN 있으면 3개 모델 모두 노출", () => {
    process.env.PORTFOLIO_AWS_ROLE_ARN = "arn:aws:iam::123456789012:role/portfolio-vercel-runtime";
    clearEnvCache();
    const models = listAvailableModels();
    expect(models).toHaveLength(3);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("nova-lite");
    expect(ids).toContain("nova-micro");
    expect(ids).toContain("claude-haiku");
  });

  it("PORTFOLIO_AWS_PROFILE (로컬 dev) 있어도 노출", () => {
    process.env.PORTFOLIO_AWS_PROFILE = "default";
    clearEnvCache();
    expect(listAvailableModels()).toHaveLength(3);
  });
});

describe("createModel", () => {
  it("AWS 자격 증명 경로 부재 시 throw", () => {
    const spec = resolveModel("nova-lite");
    expect(() => createModel(spec)).toThrow(/PORTFOLIO_AWS_ROLE_ARN|PORTFOLIO_AWS_PROFILE/);
  });

  it("PORTFOLIO_AWS_ROLE_ARN 있으면 LanguageModel 인스턴스 반환 (실제 호출 X)", () => {
    process.env.PORTFOLIO_AWS_ROLE_ARN = "arn:aws:iam::123456789012:role/portfolio-vercel-runtime";
    clearEnvCache();
    const spec = resolveModel("nova-lite");
    const model = createModel(spec);
    expect(model).toBeDefined();
    expect(typeof model).toBe("object");
  });

  it("MOCK_LLM=1 시 mock 모델 반환 + generateText 결정적 echo (AWS 호출 0회)", async () => {
    process.env.MOCK_LLM = "1";
    clearEnvCache();
    const spec = resolveModel("nova-lite");
    const model = createModel(spec);
    const result = await generateText({
      model,
      prompt: "Hello, world!",
    });
    expect(result.text).toContain("[mock-llm]");
    expect(result.text).toContain("Hello, world!");
  });
});
