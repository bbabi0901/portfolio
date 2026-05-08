import fs from "node:fs";
import path from "node:path";
import { E2E_PORTFOLIO_FIXTURE } from "./fixtures/portfolio";

/**
 * Playwright global-setup. data/portfolio.server.json 또는 public/data/suggestions.json
 * 이 없으면 fixture 로 자동 생성. 이미 있으면 그대로 사용.
 */
export default async function globalSetup() {
  const root = process.cwd();

  const serverJson = path.join(root, "data", "portfolio.server.json");
  if (!fs.existsSync(serverJson)) {
    fs.mkdirSync(path.dirname(serverJson), { recursive: true });
    fs.writeFileSync(serverJson, JSON.stringify(E2E_PORTFOLIO_FIXTURE, null, 2), "utf-8");
  }

  const suggestionsDir = path.join(root, "public", "data");
  const suggestionsJson = path.join(suggestionsDir, "suggestions.json");
  if (!fs.existsSync(suggestionsJson)) {
    fs.mkdirSync(suggestionsDir, { recursive: true });
    let questions = E2E_PORTFOLIO_FIXTURE.suggestedQuestions;
    try {
      const spec = JSON.parse(fs.readFileSync(path.join(root, "spec.json"), "utf-8")) as {
        suggestedQuestions?: typeof questions;
      };
      if (Array.isArray(spec.suggestedQuestions) && spec.suggestedQuestions.length > 0) {
        questions = spec.suggestedQuestions;
      }
    } catch {
      // spec.json 부재 시 fixture 폴백
    }
    fs.writeFileSync(suggestionsJson, JSON.stringify({ questions }, null, 2), "utf-8");
  }
}
