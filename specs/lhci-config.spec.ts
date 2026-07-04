import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const configPath = resolve(process.cwd(), ".lighthouserc.json");

describe(".lighthouserc.json", () => {
  it("유효한 JSON 파일", () => {
    const content = readFileSync(configPath, "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("ci.assert.assertions 키 포함", () => {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      ci: {
        assert: {
          assertions: Record<string, unknown>;
        };
      };
    };
    expect(config.ci.assert.assertions).toBeDefined();
  });

  it("performance 임계값 0.9", () => {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      ci: { assert: { assertions: Record<string, [string, { minScore: number }]> } };
    };
    const perf = config.ci.assert.assertions["categories:performance"];
    expect(perf).toBeDefined();
    expect(perf[1].minScore).toBe(0.9);
  });

  it("accessibility 임계값 0.95", () => {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      ci: { assert: { assertions: Record<string, [string, { minScore: number }]> } };
    };
    const a11y = config.ci.assert.assertions["categories:accessibility"];
    expect(a11y[1].minScore).toBe(0.95);
  });

  it("seo 임계값 0.95", () => {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      ci: { assert: { assertions: Record<string, [string, { minScore: number }]> } };
    };
    const seo = config.ci.assert.assertions["categories:seo"];
    expect(seo[1].minScore).toBe(0.95);
  });

  it("best-practices 임계값 0.95", () => {
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      ci: { assert: { assertions: Record<string, [string, { minScore: number }]> } };
    };
    const bp = config.ci.assert.assertions["categories:best-practices"];
    expect(bp[1].minScore).toBe(0.95);
  });
});
