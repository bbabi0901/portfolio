import { describe, it, expect } from "vitest";

import { resolveProfileImageUrl } from "@/lib/profile-data";

describe("resolveProfileImageUrl (FEAT-032)", () => {
  it("oneLiner 에 이미지 마크다운이 있으면 정적 asset 경로 반환", () => {
    const oneLiner =
      "![IMG_8120.jpeg](https://prod-files-secure.s3.us-west-2.amazonaws.com/x.jpg?sig=1)";
    expect(resolveProfileImageUrl(oneLiner)).toBe("/images/profile.jpg");
  });

  it("이미지가 없는 일반 텍스트 oneLiner → null (초기 fallback 유지)", () => {
    expect(resolveProfileImageUrl("프론트엔드 + 스마트컨트랙트 개발자")).toBeNull();
  });

  it("빈 값 → null", () => {
    expect(resolveProfileImageUrl(undefined)).toBeNull();
    expect(resolveProfileImageUrl(null)).toBeNull();
    expect(resolveProfileImageUrl("")).toBeNull();
  });
});
