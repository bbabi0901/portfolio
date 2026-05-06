# Step 4: spec-validation

## 읽어야 할 파일

- `/spec.json` — 검증 대상. **반드시 전체를 읽어** 모든 top-level 필드를 파악하라.
- `/docs/NOTION_SCHEMA.md` — `portfolio.server.json` zod 스키마 참고
- `/docs/ADR.md` — ADR-010 spec.json SDD
- `/docs/TESTING.md` — 검증 정책

이전 step 산출물:

- `/package.json` — scripts 갱신 대상
- `/tsconfig.json` — paths

이전 step의 `package.json`을 읽고, scripts 추가 + devDependency 추가.

## 작업

`spec.json`을 zod로 검증하는 파이프라인 + CLI 스크립트 + prebuild 훅을 만든다. spec.json 무효 시 빌드 실패.

### 사전 작업: spec.json 구조 파악

먼저 다음 명령으로 spec.json의 모든 top-level 키를 확인하라:
```bash
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('spec.json'))))"
```

실제 파일 구조를 보고 zod schema에 빠진 필드가 없도록 한다.

### 생성할 파일

1. **`lib/spec-schema.ts`** (zod schema)

   기본 골격 (실제 spec.json 필드를 보고 보완하라):
   ```ts
   import { z } from "zod";

   export const FeatureSchema = z.object({
     id: z.string().regex(/^FEAT-\d{3}$/),
     name: z.string().min(1),
     status: z.enum(["planned", "in_progress", "done"]),
     priority: z.enum(["P0", "P1", "P2"]),
     description: z.string(),
     acceptanceCriteria: z.array(z.string()).default([]),
     edgeCases: z.array(z.string()).default([]),
     errorCases: z.array(z.string()).default([]),
     dependencies: z.array(z.string()).default([]),
     tests: z.array(z.string()).default([]),
   });

   export const QuestionSchema = z.object({
     id: z.string().regex(/^Q-\d{3}$/),
     category: z.string(),
     text: z.string().min(1),
     expectedSourceTitles: z.array(z.string()).default([]),
   });

   export const ModelSchema = z.object({
     id: z.string(),
     provider: z.enum(["openai", "anthropic", "google"]),
     default: z.boolean().optional(),
     maxOutputTokens: z.number().int().positive(),
     temperature: z.number().min(0).max(2).optional(),
     topP: z.number().min(0).max(1).optional(),
   });

   export const RateLimitsSchema = z.object({
     chatPerMinute: z.number().int().positive(),
     chatPerDay: z.number().int().positive(),
     feedbackPerMinute: z.number().int().positive(),
     feedbackPerDay: z.number().int().positive().optional(),
     contactPerMinute: z.number().int().positive().optional(),
     contactPerDay: z.number().int().positive().optional(),
   });

   export const GreetingSchema = z.object({
     message: z.string().min(1),
     typingDelayMs: z.number().int().nonnegative(),
     wordIntervalMs: z.tuple([z.number().int().positive(), z.number().int().positive()]),
     rememberDays: z.number().int().nonnegative(),
   });

   export const TestScenarioSchema = z.object({
     id: z.string().regex(/^TS-\d{2,3}$/),
     title: z.string(),
     given: z.string().optional(),
     when: z.string().optional(),
     then: z.string().optional(),
     files: z.array(z.string()).default([]),
   });

   export const ErrorPolicySchema = z.object({
     id: z.string().regex(/^ERR-\d{2}$/),
     trigger: z.string(),
     userMessage: z.string(),
     operatorAction: z.string().optional(),
   });

   export const EdgeCasePolicySchema = z.object({
     id: z.string().regex(/^EC-\d{2,3}$/),
     scenario: z.string(),
     handling: z.string(),
   });

   export const PageSchema = z.object({
     route: z.string().startsWith("/"),
     title: z.string(),
     description: z.string().optional(),
     ssg: z.boolean().optional(),
     dataDeps: z.array(z.string()).default([]),
   });

   export const FormFieldSchema = z.object({
     name: z.string(),
     type: z.enum(["text", "email", "textarea", "hidden", "checkbox"]),
     required: z.boolean().default(false),
     min: z.number().optional(),
     max: z.number().optional(),
     pattern: z.string().optional(),
   });

   export const FormSchema = z.object({
     id: z.string(),
     route: z.string(),
     fields: z.array(FormFieldSchema),
   });

   export const ResponsiveSchema = z.object({
     breakpoints: z.record(z.string(), z.number()),
     // 페이지별 maxW 등은 z.unknown() 또는 명시. spec.json 실제 구조 보고 결정.
   }).passthrough();

   export const SpecSchema = z.object({
     $schema: z.string().optional(),
     version: z.string(),
     service: z.object({
       name: z.string(),
       owner: z.string(),
     }),
     features: z.array(FeatureSchema),
     suggestedQuestions: z.array(QuestionSchema),
     greeting: GreetingSchema,
     models: z.array(ModelSchema),
     rateLimits: RateLimitsSchema,
     pages: z.array(PageSchema).optional(),
     forms: z.array(FormSchema).optional(),
     responsive: ResponsiveSchema.optional(),
     testScenarios: z.array(TestScenarioSchema).optional(),
     errorPolicies: z.array(ErrorPolicySchema).optional(),
     edgeCasePolicies: z.array(EdgeCasePolicySchema).optional(),
   });

   export type Spec = z.infer<typeof SpecSchema>;
   export type Feature = z.infer<typeof FeatureSchema>;
   ```

   **주의**: 위는 골격. spec.json의 실제 키와 차이 있으면 추가/수정. `passthrough()` 남용 금지. 발견된 키는 모두 명시.

2. **`lib/spec-loader.ts`**
   ```ts
   import fs from "node:fs";
   import path from "node:path";
   import { SpecSchema, type Spec } from "./spec-schema";

   let cached: Spec | null = null;

   export function loadSpec(): Spec {
     if (cached) return cached;
     const raw = fs.readFileSync(path.join(process.cwd(), "spec.json"), "utf-8");
     const parsed = JSON.parse(raw);
     cached = SpecSchema.parse(parsed);
     return cached;
   }

   export function clearSpecCache(): void {
     cached = null;
   }
   ```
   - **Node runtime 전용.** Edge에서 호출 시도 시 `fs` 미지원으로 fail.
   - 후속 task에서 Edge 라우트에 spec 데이터 주입 필요 시 빌드시 inline JSON으로 변환하는 별도 로더 작성 (이 step 범위 외).

3. **`scripts/validate-spec.ts`** (CLI)
   ```ts
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
         console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
       }
       process.exit(1);
     }

     const spec = result.data;

     // 추가 검증
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

     // tests 파일 존재 여부는 --strict-tests 플래그가 있을 때만 강제
     const strictTests = process.argv.includes("--strict-tests");
     if (strictTests) {
       for (const f of spec.features) {
         for (const t of f.tests) {
           const p = path.join(process.cwd(), t);
           if (!fs.existsSync(p)) {
             console.error(`✗ ${f.id}.tests file missing: ${t}`);
             process.exit(1);
           }
         }
       }
     }

     console.log(
       `✓ spec.json valid: ${spec.features.length} features, ` +
       `${spec.suggestedQuestions.length} questions, ` +
       `${spec.testScenarios?.length ?? 0} scenarios`
     );
     process.exit(0);
   }

   main();
   ```
   - 실행: `tsx scripts/validate-spec.ts`.
   - 기본은 soft (tests 파일 미존재 워닝 없음). `--strict-tests`로 강화.

4. **`package.json` scripts/devDeps 갱신**
   - devDependencies 추가: `tsx@^4`, `zod@^4` (이미 shadcn이 추가했을 가능성).
   - scripts 추가:
     - `"check:spec": "tsx scripts/validate-spec.ts"`
     - `"prebuild": "npm run check:spec"`

   **주의**: `prebuild`는 `npm run build` 직전 자동 실행. 후속 task에서 sync:notion + gen:suggestions를 prebuild에 넣을 때 chain 형태로 갱신될 예정 (`"prebuild": "npm run check:spec && npm run sync:notion && npm run gen:suggestions"`). 이 step에서는 check:spec만.

### 핵심 규칙

- spec.json 무효 시 prebuild가 실패하여 `npm run build` 차단.
- zod 에러는 path와 함께 사용자 친화적 출력.
- spec.json **자체를 수정하지 마라.** 검증 코드만 추가.
- zod schema에서 `passthrough()` 남용 금지. 모든 필드 명시.

## Acceptance Criteria

```bash
# 정상 케이스
npm run check:spec               # 0 exit, 통계 출력
npm run build                    # prebuild → check:spec 자동 → 빌드 성공
npx tsc --noEmit                 # 0 exit

# Negative test (수동)
cp spec.json /tmp/spec.json.bak
echo '{ "broken": true }' > spec.json
npm run check:spec               # 1 exit, 에러 메시지에 path 포함
mv /tmp/spec.json.bak spec.json  # 복원
npm run check:spec               # 다시 0 exit

test -f lib/spec-schema.ts
test -f lib/spec-loader.ts
test -f scripts/validate-spec.ts
```

## 검증 절차

1. AC 실행 (정상 + negative).
2. 체크리스트:
   - SpecSchema가 spec.json의 모든 top-level 필드 검증?
   - feature/question id 중복 시 에러?
   - dependencies 참조 무결성 검증?
   - prebuild 자동 실행?
   - `passthrough()` 사용은 최소? (responsive 정도)
3. `phases/0-scaffold/index.json` step 4 갱신.

## 금지사항

- **`spec.json` 수정 금지.** 이유: 사용자가 직접 작성한 SSoT.
- **`zod-to-json-schema`로 `spec.schema.json` 자동 생성 금지** (이 step에서). 이유: 후속 task로 미룸. 단순화.
- **`passthrough()` 남용 금지.** 이유: 검증 강도 약화. 발견된 모든 필드 명시.
- **`JSON.parse` 후 `as Spec` 타입 캐스팅 금지.** 이유: zod 런타임 검증 강제.
- **`fs/promises` 사용 금지** (validate-spec.ts에서). 이유: CLI 스크립트는 sync API로 충분 + 단순함.
- **에러 메시지에 stack trace 출력 금지.** 이유: CI 로그 가독성.
- **`prebuild`에 sync:notion / gen:suggestions 추가 금지.** 이유: 후속 task에서 추가. 이 step은 check:spec만.
