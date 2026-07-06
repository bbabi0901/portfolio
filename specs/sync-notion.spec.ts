import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SCRIPT_PATH = "@/scripts/sync-notion";

function freshEnv(): Record<string, string> {
  return {
    NOTION_TOKEN: "",
    NOTION_PROJECTS_DB_ID: "",
    NOTION_PROFILE_PAGE_IDS: "",
    VOYAGE_API_KEY: "",
    OPENAI_API_KEY: "",
    MOCK_NOTION: "",
    MOCK_LLM: "",
    SKIP_NOTION_SYNC: "",
  };
}

describe("sync-notion script", () => {
  let tmpDir: string;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-notion-test-"));
    process.env = { ...ORIGINAL_ENV, ...freshEnv() };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
  });

  it("exits silently when SKIP_NOTION_SYNC=1 and writes nothing", async () => {
    process.env.SKIP_NOTION_SYNC = "1";
    const { main } = await import(SCRIPT_PATH);
    await main({ outDir: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "portfolio.server.json"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "portfolio.sample.json"))).toBe(false);
  });

  it("writes portfolio.server.json with chunks + 1536d embeddings + KST in mock mode", async () => {
    process.env.MOCK_NOTION = "1";
    process.env.MOCK_LLM = "1";
    process.env.NOTION_TOKEN = "fake";
    process.env.NOTION_PROJECTS_DB_ID = "fake-db";
    process.env.OPENAI_API_KEY = "fake";
    process.env.NOTION_PROFILE_PAGE_IDS = "fixture-resume";

    const { main } = await import(SCRIPT_PATH);
    await main({ outDir: tmpDir });

    const filePath = path.join(tmpDir, "portfolio.server.json");
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(data.version).toBeTruthy();
    expect(data.generatedAt).toMatch(/\+09:00$/);
    expect(Array.isArray(data.chunks)).toBe(true);
    expect(data.chunks.length).toBeGreaterThan(0);
    expect(data.chunks[0].embedding).toHaveLength(1536);
    expect(data.suggestedQuestions.length).toBeGreaterThan(0);
    expect(data.profile.name).toBeTruthy();
    expect(data.profile.contact.email).toBeTruthy();
  });

  it("emits a downsampled portfolio.sample.json alongside the server json", async () => {
    process.env.MOCK_NOTION = "1";
    process.env.MOCK_LLM = "1";
    process.env.NOTION_TOKEN = "fake";
    process.env.NOTION_PROJECTS_DB_ID = "fake-db";
    process.env.OPENAI_API_KEY = "fake";

    const { main } = await import(SCRIPT_PATH);
    await main({ outDir: tmpDir });

    const samplePath = path.join(tmpDir, "portfolio.sample.json");
    expect(fs.existsSync(samplePath)).toBe(true);
    const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    expect(sample.chunks.length).toBeLessThanOrEqual(8);
    expect(sample.chunks[0].embedding.length).toBeLessThanOrEqual(16);
    expect(sample.suggestedQuestions.length).toBeGreaterThan(0);
    expect(sample.profile.name).toBeTruthy();
  });

  it("produces deterministic chunk ordering across runs", async () => {
    process.env.MOCK_NOTION = "1";
    process.env.MOCK_LLM = "1";
    process.env.NOTION_TOKEN = "fake";
    process.env.NOTION_PROJECTS_DB_ID = "fake-db";
    process.env.OPENAI_API_KEY = "fake";

    const { main } = await import(SCRIPT_PATH);
    await main({ outDir: tmpDir });
    const a = JSON.parse(fs.readFileSync(path.join(tmpDir, "portfolio.server.json"), "utf8"));

    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "sync-notion-test-"));
    try {
      await main({ outDir: tmp2 });
      const b = JSON.parse(fs.readFileSync(path.join(tmp2, "portfolio.server.json"), "utf8"));
      const idsA = a.chunks.map((c: { id: string }) => c.id);
      const idsB = b.chunks.map((c: { id: string }) => c.id);
      expect(idsA).toEqual(idsB);
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it("rejects when NOTION_TOKEN missing and not in mock mode", async () => {
    process.env.MOCK_NOTION = "";
    process.env.NOTION_TOKEN = "";
    process.env.OPENAI_API_KEY = "fake";
    const { main } = await import(SCRIPT_PATH);
    await expect(main({ outDir: tmpDir })).rejects.toThrow(/NOTION_TOKEN/);
  });

  it("rejects when neither VOYAGE_API_KEY nor OPENAI_API_KEY is set and not in mock LLM mode", async () => {
    process.env.MOCK_NOTION = "1";
    process.env.NOTION_TOKEN = "fake";
    process.env.NOTION_PROJECTS_DB_ID = "fake-db";
    process.env.VOYAGE_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.MOCK_LLM = "";
    const { main } = await import(SCRIPT_PATH);
    await expect(main({ outDir: tmpDir })).rejects.toThrow(/VOYAGE_API_KEY|OPENAI_API_KEY/);
  });
});
