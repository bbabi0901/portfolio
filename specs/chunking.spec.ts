import { describe, it, expect } from "vitest";
import { chunkMarkdown, chunkPages, stableHash } from "@/lib/chunking";
import type { NotionPageContent } from "@/types/notion";

const samplePage = (markdown: string, id = "page-1"): NotionPageContent => ({
  ref: {
    id,
    title: "Sample",
    url: "https://www.notion.so/" + id,
    isPublic: true,
    category: "업무",
  },
  markdown,
});

describe("stableHash", () => {
  it("is deterministic", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
  });
  it("differs for different inputs", () => {
    expect(stableHash("abc")).not.toBe(stableHash("def"));
  });
});

describe("chunkMarkdown", () => {
  it("returns empty for empty input", () => {
    expect(chunkMarkdown(samplePage(""), "project")).toEqual([]);
  });

  it("splits by H2 headings", () => {
    const md = `## Section A\nfoo bar\n## Section B\nbaz qux`;
    const chunks = chunkMarkdown(samplePage(md), "project");
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.headingPath).toEqual(["Section A"]);
    expect(chunks[1]!.headingPath).toEqual(["Section B"]);
  });

  it("preserves H1 → H2 → H3 path", () => {
    const md = `# Top\n## Mid\n### Leaf\ncontent`;
    const chunks = chunkMarkdown(samplePage(md), "project");
    expect(chunks[chunks.length - 1]!.headingPath).toEqual(["Top", "Mid", "Leaf"]);
  });

  it("never splits code blocks", () => {
    const longCode = "```ts\n" + "const x = 1;\n".repeat(200) + "```";
    const md = `## Code\n${longCode}`;
    const chunks = chunkMarkdown(samplePage(md), "project");
    // 코드블록 한 덩어리 → chunk 1개에 모두 포함
    expect(chunks.filter((c) => c.text.includes("const x = 1")).length).toBe(1);
    expect(chunks[0]!.text).toContain("```ts");
    expect(chunks[0]!.text).toContain("```");
  });

  it("merges short trailing chunks (같은 최상위 섹션 안에서만)", () => {
    const md = `## Long\n${"word ".repeat(400)}\n### Tiny\nshort`;
    const chunks = chunkMarkdown(samplePage(md), "project", { mergeBelowTokens: 50 });
    // 같은 ## Long 하위의 tiny 는 머지되어 chunk 1개
    expect(chunks).toHaveLength(1);
  });

  it("H2(최상위 섹션) 경계를 넘어서는 merge 하지 않는다", () => {
    // 이력서에서 '직무 및 이력' 헤더 청크가 '자기 소개' 청크로 흡수되어
    // 회사 callout·타임라인이 통째로 소실되던 회귀 방지.
    const md = `## 자기 소개\n${"word ".repeat(200)}\n## 직무 및 이력\n> | 회사명\n\n> 2025.01 - 현재`;
    const chunks = chunkMarkdown(samplePage(md), "career", { mergeBelowTokens: 100 });
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.headingPath).toEqual(["직무 및 이력"]);
    expect(chunks[1]!.text).toContain("| 회사명");
  });

  it("merge 시 흡수되는 섹션의 하위 헤딩을 텍스트에 재주입한다 (프로젝트 제목 보존)", () => {
    const md = `## Experience\n${"word ".repeat(200)}\n### 전자책 커머스\n- Toss Payments 결제 구현`;
    const chunks = chunkMarkdown(samplePage(md), "career", { mergeBelowTokens: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("### 전자책 커머스");
    expect(chunks[0]!.text).toContain("Toss Payments");
  });

  it("큰 섹션이 뒤따르는 짧은 헤딩 섹션들을 모두 흡수하지 않는다 (merge 상한, 이력서 경력/학력 보존)", () => {
    // 큰 섹션(>targetTokens) 뒤에 짧은 헤딩 섹션이 많이 오는 이력서 형태 — 상한 없으면
    // 전부 앞 청크로 흡수되어 회사/학교명 heading 이 소실됨. targetTokens 상한으로 방지.
    const big = `## 자기소개\n${"word ".repeat(3000)}`;
    const entries = Array.from(
      { length: 10 },
      (_, i) => `## 학교${i}\n${2012 + i}년 졸업 정보 라인`,
    ).join("\n");
    const chunks = chunkMarkdown(samplePage(`${big}\n${entries}`), "career");
    const entryChunks = chunks.filter((c) => c.headingPath.some((h) => h.startsWith("학교")));
    // 각 학교 섹션 heading 이 개별 청크로 보존됨 (붕괴 방지)
    expect(entryChunks.length).toBeGreaterThanOrEqual(5);
  });

  it("emits warning on > 30 chunks per page", () => {
    const sections = Array.from({ length: 35 }, (_, i) => `## S${i}\ncontent ${i}`).join("\n");
    const warns: string[] = [];
    const chunks = chunkMarkdown(samplePage(sections), "project", {
      mergeBelowTokens: 0,
      maxChunksPerPage: 30,
      onWarn: (m) => warns.push(m),
    });
    expect(chunks.length).toBeLessThanOrEqual(30);
    expect(warns.some((w) => /30/.test(w))).toBe(true);
  });

  it("populates id, sourcePageId, sourceUrl, category, tokens", () => {
    const md = `## A\nfoo`;
    const [c] = chunkMarkdown(samplePage(md, "p-xyz"), "intro");
    expect(c!.id).toBeTruthy();
    expect(c!.sourcePageId).toBe("p-xyz");
    expect(c!.sourceUrl).toBe("https://www.notion.so/p-xyz");
    expect(c!.category).toBe("intro");
    expect(c!.tokens).toBeGreaterThan(0);
    expect(c!.embedding).toEqual([]);
  });

  it("populates tags from keywords", () => {
    const md = `## Module Federation\nNext.js Turbopack Module Federation Module`;
    const [c] = chunkMarkdown(samplePage(md), "project");
    expect(c!.tags).toBeDefined();
    expect(c!.tags!.length).toBeGreaterThan(0);
  });

  it("ids are deterministic across runs", () => {
    const md = `## A\nfoo`;
    const [a] = chunkMarkdown(samplePage(md, "p1"), "project");
    const [b] = chunkMarkdown(samplePage(md, "p1"), "project");
    expect(a!.id).toBe(b!.id);
  });
});

describe("chunkPages", () => {
  it("respects per-page limit", () => {
    const pages = [samplePage("## A\nfoo", "p1"), samplePage("## B\nbar", "p2")];
    const chunks = chunkPages(pages, () => "project");
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.sourcePageId).toBe("p1");
    expect(chunks[1]!.sourcePageId).toBe("p2");
  });
});
