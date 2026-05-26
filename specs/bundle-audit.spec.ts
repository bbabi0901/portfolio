import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * TS-69: 클라이언트 번들에 1536 차원 임베딩 vector 가 포함되지 않음을 검증.
 *
 * data/portfolio.server.json 의 chunks[].embedding (1536 numeric array) 이
 * 어떤 경로로든 .next/static/chunks 의 client 번들에 들어가면 보안/사이즈 측면 위반.
 *
 * .next 빌드 결과물이 없는 환경에서는 skip.
 */
describe("TS-69 critical bundle audit (client embedding leak)", () => {
  it("no 1530+-element numeric array in .next/static/chunks/*.js", () => {
    const dir = path.join(process.cwd(), ".next", "static", "chunks");
    if (!fs.existsSync(dir)) {
      // 빌드 산출물 없음 → skip
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));

    // 1530개 이상 연속된 numeric literal (음수/소수 포함) — embedding pattern.
    const re = /\[(?:-?\d+(?:\.\d+)?,){1530,}-?\d+(?:\.\d+)?\]/;

    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), "utf-8");
      const match = re.test(text);
      expect(
        match,
        `client chunk '${f}' appears to embed a >=1530-len numeric array (possible 1536-dim embedding leak)`,
      ).toBe(false);
    }
  });
});
