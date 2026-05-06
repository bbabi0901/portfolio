import fs from "node:fs";
import path from "node:path";
import { SpecSchema, type Spec } from "./spec-schema";

let cached: Spec | null = null;

export function loadSpec(): Spec {
  if (cached) return cached;
  const raw = fs.readFileSync(path.join(process.cwd(), "spec.json"), "utf-8");
  const parsed: unknown = JSON.parse(raw);
  cached = SpecSchema.parse(parsed);
  return cached;
}

export function clearSpecCache(): void {
  cached = null;
}
