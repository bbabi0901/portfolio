#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { SpecSchema } from "../lib/spec-schema";

function main(): void {
  const specPath = path.join(process.cwd(), "spec.json");
  const raw = fs.readFileSync(specPath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("✗ spec.json is not valid JSON:", (e as Error).message);
    process.exit(1);
  }

  const result = SpecSchema.safeParse(parsed);
  if (!result.success) {
    console.error("✗ spec.json schema violation:");
    for (const issue of result.error.issues) {
      const p = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      console.error(`  - ${p}: ${issue.message}`);
    }
    process.exit(1);
  }

  const spec = result.data;

  const featureIds = new Set<string>();
  for (const f of spec.features) {
    if (featureIds.has(f.id)) {
      console.error(`✗ duplicate feature id: ${f.id}`);
      process.exit(1);
    }
    featureIds.add(f.id);
  }

  for (const f of spec.features) {
    for (const dep of f.dependencies) {
      if (!featureIds.has(dep)) {
        console.error(`✗ ${f.id}.dependencies references unknown ${dep}`);
        process.exit(1);
      }
    }
  }

  const qIds = new Set<string>();
  for (const q of spec.suggestedQuestions) {
    if (qIds.has(q.id)) {
      console.error(`✗ duplicate question id: ${q.id}`);
      process.exit(1);
    }
    qIds.add(q.id);
  }

  const errIds = new Set<string>();
  for (const e of spec.errorPolicies) {
    if (errIds.has(e.id)) {
      console.error(`✗ duplicate errorPolicy id: ${e.id}`);
      process.exit(1);
    }
    errIds.add(e.id);
  }

  const ecIds = new Set<string>();
  for (const ec of spec.edgeCasePolicies) {
    if (ecIds.has(ec.id)) {
      console.error(`✗ duplicate edgeCasePolicy id: ${ec.id}`);
      process.exit(1);
    }
    ecIds.add(ec.id);
  }

  const tsIds = new Set<string>();
  for (const t of spec.testScenarios) {
    if (tsIds.has(t.id)) {
      console.error(`✗ duplicate testScenario id: ${t.id}`);
      process.exit(1);
    }
    tsIds.add(t.id);
    if (!featureIds.has(t.feature)) {
      console.error(`✗ ${t.id}.feature references unknown feature: ${t.feature}`);
      process.exit(1);
    }
  }

  const strictTests = process.argv.includes("--strict-tests");
  if (strictTests) {
    let missing = 0;
    for (const f of spec.features) {
      for (const t of f.tests) {
        const fileOnly = t.split(":")[0];
        if (!fileOnly) continue;
        const p = path.join(process.cwd(), fileOnly);
        if (!fs.existsSync(p)) {
          console.error(`✗ ${f.id}.tests file missing: ${fileOnly}`);
          missing += 1;
        }
      }
    }
    if (missing > 0) process.exit(1);
  }

  console.log(
    `✓ spec.json valid: ${spec.features.length} features, ` +
      `${spec.suggestedQuestions.length} questions, ` +
      `${spec.testScenarios.length} scenarios, ` +
      `${spec.errorPolicies.length} error policies, ` +
      `${spec.edgeCasePolicies.length} edge cases`,
  );
  process.exit(0);
}

main();
