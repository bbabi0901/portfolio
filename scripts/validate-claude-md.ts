// CLAUDE.md에 문서화된 `npm run X`가 package.json scripts에 실제 존재하는지 검사.
// 문서가 stale해지면 check:spec(=prebuild·PR 게이트)이 실패한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>;

// infra/ 워크스페이스 블록은 별도 package.json이므로 제외
const rootDoc = claudeMd.replace(/```\n# infra\/[\s\S]*?```/g, "");
const documented = [...rootDoc.matchAll(/npm run ([\w:.-]+)/g)].map((m) => m[1]);
const missing = [...new Set(documented)].filter((name) => !(name in scripts));

if (missing.length) {
  console.error(`CLAUDE.md에 있지만 package.json scripts에 없는 명령어: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`validate-claude-md: ${new Set(documented).size}개 명령어 확인 완료`);
