#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { main as syncNotion } from "./sync-notion";

/**
 * prebuild 용 조건부 sync 게이트 (FEAT-033).
 * data/portfolio.server.json 은 git 에 커밋되므로(ADR-030) 평상시 빌드는 sync 를 생략하고
 * 커밋된 데이터를 사용한다. 노션 콘텐츠 반영은 로컬에서 `npm run sync:notion` → 커밋 → 푸시.
 *
 * 우선순위: SKIP_NOTION_SYNC(생략, CI) > FORCE_NOTION_SYNC(강제) > 데이터 부재(안전망 sync) > 생략.
 */
export interface SyncDecision {
  action: "skip" | "sync";
  reason: string;
}

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true";
}

export function decideSync(opts: {
  skipEnv?: string;
  forceEnv?: string;
  dataFileExists: boolean;
}): SyncDecision {
  if (isOn(opts.skipEnv)) {
    return { action: "skip", reason: "SKIP_NOTION_SYNC=1" };
  }
  if (isOn(opts.forceEnv)) {
    return { action: "sync", reason: "FORCE_NOTION_SYNC=1" };
  }
  if (!opts.dataFileExists) {
    return { action: "sync", reason: "data/portfolio.server.json·fallback.json 모두 없음 (안전망)" };
  }
  return { action: "skip", reason: "커밋된 데이터 사용" };
}

async function run(): Promise<void> {
  // 커밋본은 슬림 폴백(ADR-038) — 로컬 sync 산출물(server.json)이 있으면 그것을 우선
  const serverFile = path.join(process.cwd(), "data", "portfolio.server.json");
  const fallbackFile = path.join(process.cwd(), "data", "portfolio.fallback.json");
  const dataFile = fs.existsSync(serverFile) ? serverFile : fallbackFile;
  const dataFileExists = fs.existsSync(dataFile);

  const decision = decideSync({
    skipEnv: process.env.SKIP_NOTION_SYNC,
    forceEnv: process.env.FORCE_NOTION_SYNC,
    dataFileExists,
  });

  if (decision.action === "skip") {
    let generatedAt = "unknown";
    if (dataFileExists) {
      try {
        const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8")) as { generatedAt?: string };
        generatedAt = parsed.generatedAt ?? "unknown";
      } catch {
        /* 로그용 — 파싱 실패는 무시 */
      }
    }
    console.log(
      `[sync-if-needed] sync 생략 (${decision.reason}, generatedAt ${generatedAt}) — ` +
        `강제하려면 FORCE_NOTION_SYNC=1`,
    );
    return;
  }

  console.log(`[sync-if-needed] sync 실행 (${decision.reason})`);
  await syncNotion();
}

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const resolved = path.resolve(entry);
  return resolved.endsWith("sync-if-needed.ts") || resolved.endsWith("sync-if-needed.js");
})();

if (isDirectRun) {
  run().catch((err: Error) => {
    console.error(err.message ?? String(err));
    process.exit(1);
  });
}
