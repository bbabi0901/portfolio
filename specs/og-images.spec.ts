import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * FEAT-019 — favicon + 페이지별 OG 카드 (TS-86, TS-87).
 * ImageResponse 렌더 자체는 e2e(TS-64)에서 PNG 응답으로 검증하고,
 * 여기서는 라우트 모듈 계약(size/contentType/alt)과 자산 존재를 고정한다.
 */

const OG_ROUTES: Array<{ file: string; titleHint: string }> = [
  { file: "@/app/opengraph-image", titleHint: "AI Portfolio" },
  { file: "@/app/chat/opengraph-image", titleHint: "채팅" },
  { file: "@/app/about/opengraph-image", titleHint: "자기소개" },
  { file: "@/app/experience/opengraph-image", titleHint: "커리어" },
  { file: "@/app/contact/opengraph-image", titleHint: "연락" },
];

describe("페이지별 opengraph-image 라우트 계약 (TS-87)", () => {
  for (const route of OG_ROUTES) {
    it(`${route.file} — 1200×630 png + alt에 "${route.titleHint}"`, async () => {
      const mod = await import(route.file);
      expect(mod.size).toEqual({ width: 1200, height: 630 });
      expect(mod.contentType).toBe("image/png");
      expect(mod.alt).toContain(route.titleHint);
      expect(typeof mod.default).toBe("function");
      // Edge 런타임 금지 (한글 폰트 자산이 Edge 1MB 한도 초과 — ADR-033)
      expect(mod.runtime).not.toBe("edge");
    });
  }
});

describe("favicon 라우트 계약 (TS-86)", () => {
  it("app/icon.tsx — 32×32 png", async () => {
    const mod = await import("@/app/icon");
    expect(mod.size).toEqual({ width: 32, height: 32 });
    expect(mod.contentType).toBe("image/png");
    expect(typeof mod.default).toBe("function");
  });

  it("app/apple-icon.tsx — 180×180 png", async () => {
    const mod = await import("@/app/apple-icon");
    expect(mod.size).toEqual({ width: 180, height: 180 });
    expect(mod.contentType).toBe("image/png");
    expect(typeof mod.default).toBe("function");
  });

  it("정적 favicon.ico 존재 (레거시 /favicon.ico 직접 요청 대응)", () => {
    expect(fs.existsSync(path.join(process.cwd(), "app", "favicon.ico"))).toBe(true);
  });
});

describe("OG 카드 자산 (TS-87)", () => {
  it("Pretendard woff 폰트 자산 존재 (satori는 woff2 미지원)", () => {
    const dir = path.join(process.cwd(), "assets", "fonts");
    expect(fs.existsSync(path.join(dir, "Pretendard-SemiBold.woff"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "Pretendard-Regular.woff"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "LICENSE"))).toBe(true);
  });

  it("프로필 사진 자산 존재", () => {
    expect(fs.existsSync(path.join(process.cwd(), "public", "images", "profile.jpg"))).toBe(true);
  });

  it("og-card 빌더가 ImageResponse 를 반환", async () => {
    const { ogCard } = await import("@/lib/og-card");
    const res = ogCard({ title: "테스트", subtitle: "서브타이틀" });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("image/png");
  });
});
