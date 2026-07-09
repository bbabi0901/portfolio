#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { compareFreshness } from "@/lib/notion-freshness";
import { createNotionService } from "@/services/notion";
import type { NotionPageRef } from "@/types/notion";

/**
 * sync:check — 노션 소스(프로젝트 DB·프로필·트러블슈팅·엑스트라)의 last_edited_time 을
 * refs 만 조회(페이지 콘텐츠 fetch 없음 — 저렴)해서 data/portfolio.server.json 의
 * generatedAt 과 비교한다. (FEAT-033)
 *
 * exit 0 = FRESH (sync 불필요) / exit 1 = STALE (sync 권장) / exit 2 = 판단 불가(설정 부족 등)
 */
function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function run(): Promise<void> {
  const env = process.env;
  if (!env.NOTION_TOKEN || !env.NOTION_PROJECTS_DB_ID) {
    console.error("[sync:check] NOTION_TOKEN / NOTION_PROJECTS_DB_ID 가 필요합니다.");
    process.exit(2);
  }

  const dataFile = path.join(process.cwd(), "data", "portfolio.server.json");
  let generatedAt = "";
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8")) as { generatedAt?: string };
    generatedAt = parsed.generatedAt ?? "";
  } catch {
    console.log("[sync:check] data/portfolio.server.json 없음 → STALE (최초 sync 필요)");
    process.exit(1);
  }

  const notion = createNotionService({ token: env.NOTION_TOKEN! });

  const refs: NotionPageRef[] = [];
  refs.push(...(await notion.queryDatabase(env.NOTION_PROJECTS_DB_ID!)));
  if (env.NOTION_TROUBLESHOOTING_DB_ID) {
    refs.push(...(await notion.queryDatabase(env.NOTION_TROUBLESHOOTING_DB_ID)));
  }
  for (const id of [
    ...parseIds(env.NOTION_PROFILE_PAGE_IDS),
    ...parseIds(env.NOTION_EXTRA_PAGE_IDS),
  ]) {
    const ref = await notion.getPageRef(id);
    if (ref) refs.push(ref);
  }

  const result = compareFreshness(refs, generatedAt);

  if (!result.stale) {
    console.log(
      `[sync:check] FRESH — ${refs.length}개 소스 페이지 모두 generatedAt(${generatedAt}) 이전 수정. sync 불필요.`,
    );
    return;
  }

  console.log(
    `[sync:check] STALE — generatedAt(${generatedAt}) 이후 수정된 페이지 ${result.staleRefs.length}개:`,
  );
  for (const s of result.staleRefs) {
    console.log(`  - ${s.title} (${s.lastEditedTime})`);
  }
  console.log("[sync:check] → npm run sync:notion 후 data/ 커밋을 권장합니다.");
  process.exit(1);
}

run().catch((err: Error) => {
  console.error(`[sync:check] 실패: ${err.message ?? String(err)}`);
  process.exit(2);
});
