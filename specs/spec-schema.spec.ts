import { describe, it, expect } from "vitest";
import { SpecSchema } from "@/lib/spec-schema";
import spec from "@/spec.json";

describe("spec.json", () => {
  it("validates against SpecSchema", () => {
    const result = SpecSchema.safeParse(spec);
    if (!result.success) {
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
  });
});
