import { z } from "zod";

const FeatureId = z.string().regex(/^FEAT-\d{3}$/);
const QuestionId = z.string().regex(/^Q-\d{3}$/);
const ScenarioId = z.string().regex(/^TS-\d{2,3}$/);
const ErrorId = z.string().regex(/^ERR-\d{2}$/);
const EdgeCaseId = z.string().regex(/^EC-\d{2,3}$/);

export const ServiceSchema = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  ownerEmail: z.string().email().optional(),
  homepage: z.string().url().optional(),
  repo: z.string().optional(),
  timezone: z.string().optional(),
});

export const GreetingSchema = z.object({
  message: z.string().min(1),
  typingDelayMs: z.number().int().nonnegative(),
  wordIntervalMs: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  rememberDays: z.number().int().nonnegative(),
});

export const ModelSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["amazon", "anthropic"]),
  default: z.boolean(),
  maxOutputTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
});

export const RateLimitsSchema = z.object({
  chatPerMinute: z.number().int().positive(),
  chatPerDay: z.number().int().positive(),
  feedbackPerMinute: z.number().int().positive(),
  feedbackPerDay: z.number().int().positive(),
  contactPerMinute: z.number().int().positive(),
  contactPerDay: z.number().int().positive(),
  maxTokensPerDayDefault: z.number().int().positive(),
  maxMessageLength: z.number().int().positive(),
});

export const RetrievalSchema = z.object({
  embeddingModel: z.string().min(1),
  embeddingDimensions: z.number().int().positive(),
  topK: z.number().int().positive(),
  maxContextTokens: z.number().int().positive(),
  weights: z.object({
    keyword: z.number().min(0).max(1),
    vector: z.number().min(0).max(1),
  }),
  minVectorScore: z.number().min(0).max(1),
  minQueryLengthForEmbedding: z.number().int().nonnegative(),
});

export const PageSchema = z.object({
  route: z.string().startsWith("/"),
  name: z.string().min(1),
  type: z.enum(["client", "ssg", "static"]),
  title: z.string().min(1),
  description: z.string().optional(),
  ogImage: z.string().optional(),
  robots: z.string().optional(),
});

export const FormFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["text", "email", "textarea", "honeypot"]),
  required: z.boolean().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: z.string().optional(),
  trim: z.boolean().optional(),
  autocomplete: z.string().optional(),
  mustBeEmpty: z.boolean().optional(),
});

export const FormSchema = z.object({
  id: z.string().min(1),
  fields: z.array(FormFieldSchema).min(1),
  minSubmitDelayMs: z.number().int().nonnegative().optional(),
  destination: z
    .object({
      primary: z.string().min(1),
      fallback: z.array(z.string()).default([]),
    })
    .optional(),
});

const BreakpointStringMap = z.record(z.string(), z.union([z.string(), z.number()]));

export const DeviceSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const ResponsiveSchema = z.object({
  breakpoints: z.record(z.string(), z.number().int().positive()),
  maxW: z.record(z.string(), BreakpointStringMap).optional(),
  headerHeight: BreakpointStringMap.optional(),
  sideSheetWidth: BreakpointStringMap.optional(),
  carouselSlides: BreakpointStringMap.optional(),
  messageMaxW: BreakpointStringMap.optional(),
  fontBase: BreakpointStringMap.optional(),
  deviceMatrix: z.array(DeviceSchema).optional(),
});

export const QuestionSchema = z.object({
  id: QuestionId,
  category: z.string().min(1),
  text: z.string().min(1),
  expectedSourceTitles: z.array(z.string()).default([]),
});

export const ErrorPolicySchema = z.object({
  id: ErrorId,
  trigger: z.string().min(1),
  userMessage: z.string().nullable(),
  ui: z.string().optional(),
  retry: z.string().optional(),
  highlight: z.string().optional(),
  fallback: z.string().optional(),
  alert: z.boolean().optional(),
  behavior: z.string().optional(),
  header: z.string().optional(),
});

export const EdgeCasePolicySchema = z.object({
  id: EdgeCaseId,
  scenario: z.string().min(1),
  behavior: z.string().min(1),
});

export const FeatureSchema = z.object({
  id: FeatureId,
  name: z.string().min(1),
  status: z.enum(["planned", "in_progress", "done"]),
  priority: z.enum(["P0", "P1", "P2"]),
  tests: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
});

export const TestScenarioSchema = z.object({
  id: ScenarioId,
  feature: FeatureId,
  title: z.string().min(1),
  file: z.string().min(1),
  anchor: z.string().optional(),
});

export const SpecSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().min(1),
  service: ServiceSchema,
  greeting: GreetingSchema,
  models: z.array(ModelSchema).min(1),
  rateLimits: RateLimitsSchema,
  retrieval: RetrievalSchema,
  pages: z.array(PageSchema).min(1),
  forms: z.array(FormSchema),
  responsive: ResponsiveSchema,
  suggestedQuestions: z.array(QuestionSchema),
  errorPolicies: z.array(ErrorPolicySchema),
  edgeCasePolicies: z.array(EdgeCasePolicySchema),
  features: z.array(FeatureSchema).min(1),
  testScenarios: z.array(TestScenarioSchema),
});

export type Spec = z.infer<typeof SpecSchema>;
export type Service = z.infer<typeof ServiceSchema>;
export type Greeting = z.infer<typeof GreetingSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type RateLimits = z.infer<typeof RateLimitsSchema>;
export type Retrieval = z.infer<typeof RetrievalSchema>;
export type Page = z.infer<typeof PageSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type Form = z.infer<typeof FormSchema>;
export type Responsive = z.infer<typeof ResponsiveSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type ErrorPolicy = z.infer<typeof ErrorPolicySchema>;
export type EdgeCasePolicy = z.infer<typeof EdgeCasePolicySchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type TestScenario = z.infer<typeof TestScenarioSchema>;
