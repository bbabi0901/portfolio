import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { clearPortfolioCache } from "@/lib/portfolio-data";
import { main as generateMain } from "@/scripts/generate-suggestions";

const FIXTURE_SAMPLE = "data/portfolio.sample.json";

describe("generate-suggestions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-sug-"));
    clearPortfolioCache();
  });

  it("writes suggestions.json with required client-safe fields and no chunks/embeddings", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });

    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    expect(data.suggestedQuestions).toBeDefined();
    expect(Array.isArray(data.suggestedQuestions)).toBe(true);
    expect(data.profile).toBeDefined();
    expect(data.profile.name).toBeTypeOf("string");
    expect(data.version).toBeTypeOf("string");
    expect(data.generatedAt).toBeTypeOf("string");
    expect(data.relatedQuestions).toBeDefined();
    expect("chunks" in data).toBe(false);
    expect("embedding" in data).toBe(false);
    expect("embeddings" in data).toBe(false);

    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/"embedding"/);
  });

  it("preserves core 18 questions (Q-001..Q-018) from input", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    const coreIds = data.suggestedQuestions
      .map((q: { id: string }) => q.id)
      .filter((id: string) => /^Q-0(0[1-9]|1[0-8])$/.test(id));
    expect(coreIds.length).toBe(18);
  });

  it("caps total questions at 30", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    expect(data.suggestedQuestions.length).toBeLessThanOrEqual(30);
    expect(data.suggestedQuestions.length).toBeGreaterThanOrEqual(18);
  });

  it("auto-added questions use Q-100+ ids", async () => {
    const sample = JSON.parse(fs.readFileSync(FIXTURE_SAMPLE, "utf-8"));
    const fixturePath = path.join(tmpDir, "with-personal.json");
    sample.chunks.push({
      id: "fixture-personal-1",
      sourcePageId: "fixture-personal",
      sourceTitle: "취미 페이지",
      sourceUrl: "https://www.notion.so/fixture-personal",
      category: "personal",
      headingPath: ["취미"],
      text: "독서와 등산.",
      tokens: 5,
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6],
      tags: ["독서", "등산"],
    });
    fs.writeFileSync(fixturePath, JSON.stringify(sample));

    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: fixturePath, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));

    const autoIds = data.suggestedQuestions
      .map((q: { id: string }) => q.id)
      .filter((id: string) => !/^Q-0(0[1-9]|1[0-8])$/.test(id));
    for (const id of autoIds) {
      expect(id).toMatch(/^Q-1\d{2,}$/);
    }
    const hasHobbyAuto = data.suggestedQuestions.some(
      (q: { text: string }) => q.text === "취미가 뭐예요?",
    );
    expect(hasHobbyAuto).toBe(true);
  });

  it("dedupes by normalized text (whitespace + punctuation case-insensitive)", async () => {
    const sample = JSON.parse(fs.readFileSync(FIXTURE_SAMPLE, "utf-8"));
    sample.suggestedQuestions = [
      ...sample.suggestedQuestions,
      {
        id: "Q-100",
        category: "intro",
        text: "   김윤수 어떤 개발자예요???   ",
        expectedSourceTitles: [],
      },
    ];
    const fixturePath = path.join(tmpDir, "with-dup.json");
    fs.writeFileSync(fixturePath, JSON.stringify(sample));

    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: fixturePath, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));

    const dupMatches = data.suggestedQuestions.filter(
      (q: { text: string }) => q.text.replace(/\s+/g, "").startsWith("김윤수어떤개발자예요"),
    );
    expect(dupMatches.length).toBe(1);
    expect(dupMatches[0].id).toBe("Q-001");
  });

  it("relatedQuestions maps each chunk id to up to 3 question ids", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));

    const sample = JSON.parse(fs.readFileSync(FIXTURE_SAMPLE, "utf-8"));
    for (const chunk of sample.chunks) {
      expect(chunk.id in data.relatedQuestions).toBe(true);
      const arr = data.relatedQuestions[chunk.id];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeLessThanOrEqual(3);
      for (const qid of arr) {
        const exists = data.suggestedQuestions.some(
          (q: { id: string }) => q.id === qid,
        );
        expect(exists).toBe(true);
      }
    }
  });

  it("is deterministic (same input → same output, ignoring nothing meaningful)", async () => {
    const out1 = path.join(tmpDir, "a.json");
    const out2 = path.join(tmpDir, "b.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out1 });
    clearPortfolioCache();
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out2 });
    const a = JSON.parse(fs.readFileSync(out1, "utf-8"));
    const b = JSON.parse(fs.readFileSync(out2, "utf-8"));
    delete a.generatedAt;
    delete b.generatedAt;
    expect(a).toEqual(b);
  });
});
