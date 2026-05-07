import { describe, it, expect } from "vitest";
import path from "node:path";
import { createNotionService } from "@/services/notion";

const FIXTURE_DIR = path.resolve(__dirname, "../tests/fixtures/notion");

describe("NotionService", () => {
  describe("MOCK mode", () => {
    const svc = createNotionService({
      token: "fake",
      mock: true,
      fixtureDir: FIXTURE_DIR,
    });

    it("queryDatabase returns ref list from fixture", async () => {
      const refs = await svc.queryDatabase("fixture-db");
      expect(refs.length).toBeGreaterThan(0);
      const first = refs.find((r) => r.id === "fixture-page-1");
      expect(first).toBeDefined();
      expect(first!.title).toBe("Sample Project");
      expect(first!.category).toBe("업무");
      expect(first!.status).toBe("Done");
      expect(first!.period).toBe("2025.11–12");
      expect(first!.url).toBe("https://www.notion.so/fixture-page-1");
    });

    it("normalizes English property keys (Name/Category/Status)", async () => {
      const refs = await svc.queryDatabase("fixture-db");
      const second = refs.find((r) => r.id === "fixture-page-2");
      expect(second).toBeDefined();
      expect(second!.title).toBe("English Title Project");
      expect(second!.category).toBe("외부활동");
      expect(second!.status).toBe("In progress");
    });

    it("queryDatabase honors categoryFilter", async () => {
      const refs = await svc.queryDatabase("fixture-db", {
        categoryFilter: ["업무"],
      });
      expect(refs.every((r) => r.category === "업무")).toBe(true);
      expect(refs.length).toBeGreaterThan(0);
    });

    it("getPageRef returns ref from db fixture", async () => {
      const ref = await svc.getPageRef("fixture-page-1");
      expect(ref).not.toBeNull();
      expect(ref!.title).toBe("Sample Project");
    });

    it("getPageRef returns null for missing", async () => {
      const ref = await svc.getPageRef("nonexistent-id");
      expect(ref).toBeNull();
    });

    it("getPageContent returns markdown from fixture", async () => {
      const content = await svc.getPageContent("fixture-page-1");
      expect(content).not.toBeNull();
      expect(content!.markdown).toContain("## 개요");
      expect(content!.markdown).toContain("Module Federation");
      expect(content!.ref.id).toBe("fixture-page-1");
    });

    it("getPageContent returns content for resume page (no DB entry)", async () => {
      const content = await svc.getPageContent("fixture-resume");
      expect(content).not.toBeNull();
      expect(content!.markdown).toContain("자기소개");
    });

    it("returns null for missing fixture", async () => {
      const content = await svc.getPageContent("nonexistent");
      expect(content).toBeNull();
    });

    it("getPagesContent skips missing with onSkip callback", async () => {
      const skipped: string[] = [];
      const contents = await svc.getPagesContent(
        ["fixture-page-1", "missing", "fixture-resume"],
        {
          onSkip: (id) => skipped.push(id),
        },
      );
      expect(contents).toHaveLength(2);
      expect(skipped).toContain("missing");
    });

    it("getPagesContent respects concurrency option", async () => {
      const contents = await svc.getPagesContent(
        ["fixture-page-1", "fixture-resume"],
        { concurrency: 1 },
      );
      expect(contents).toHaveLength(2);
    });
  });

  describe("non-MOCK mode (msw mocked Notion API)", () => {
    const svc = createNotionService({
      token: "fake",
      mock: false,
      rateLimitBackoffMs: 0,
    });

    it("queryDatabase returns array (paginates against msw stub)", async () => {
      const refs = await svc.queryDatabase("any-db");
      expect(Array.isArray(refs)).toBe(true);
    });

    it("getPageRef returns a ref for a stubbed page", async () => {
      const ref = await svc.getPageRef("any-page");
      expect(ref).not.toBeNull();
      expect(ref!.id).toBe("any-page");
    });
  });

  describe("error handling", () => {
    it("throws when token missing", () => {
      expect(() => createNotionService({ token: "" })).toThrow();
    });
  });
});
