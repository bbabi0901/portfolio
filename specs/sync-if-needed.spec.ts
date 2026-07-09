import { describe, it, expect } from "vitest";
import { decideSync } from "@/scripts/sync-if-needed";

describe("decideSync (prebuild sync 게이트)", () => {
  it("SKIP_NOTION_SYNC=1 → 생략 (CI 호환, FORCE 보다 우선)", () => {
    const d = decideSync({ skipEnv: "1", forceEnv: "1", dataFileExists: true });
    expect(d.action).toBe("skip");
    expect(d.reason).toContain("SKIP_NOTION_SYNC");
  });

  it("FORCE_NOTION_SYNC=1 → 강제 sync", () => {
    const d = decideSync({ forceEnv: "1", dataFileExists: true });
    expect(d.action).toBe("sync");
    expect(d.reason).toContain("FORCE_NOTION_SYNC");
  });

  it("데이터 파일 없음 → sync (안전망)", () => {
    const d = decideSync({ dataFileExists: false });
    expect(d.action).toBe("sync");
  });

  it("데이터 파일 있음 + 플래그 없음 → 생략 (커밋 데이터 사용)", () => {
    const d = decideSync({ dataFileExists: true });
    expect(d.action).toBe("skip");
  });

  it("플래그 값 'true' 도 인식", () => {
    expect(decideSync({ forceEnv: "true", dataFileExists: true }).action).toBe("sync");
    expect(decideSync({ skipEnv: "true", dataFileExists: false }).action).toBe("skip");
  });
});
