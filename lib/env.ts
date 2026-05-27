import { z } from "zod";

const ServerEnvSchema = z.object({
  // Vercel AI Gateway — 단일 키로 OpenAI/Anthropic/Google 통합 (ADR-025)
  // 설정 시 아래 직접 키보다 우선. Vercel 대시보드 > AI Gateway에서 발급.
  AI_GATEWAY_API_KEY: z.string().optional(),
  // 직접 provider 키 (AI_GATEWAY_API_KEY 미설정 시 fallback)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  NOTION_FEEDBACK_DB_ID: z.string().optional(),
  NOTION_CONTACT_DB_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_TO_EMAIL: z.string().email().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  MAX_TOKENS_PER_DAY: z.coerce.number().int().nonnegative().default(200_000),
  RATE_LIMIT_BYPASS: z.string().optional(),
  MOCK_LLM: z.string().optional(),
  MOCK_NOTION: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = ServerEnvSchema.parse(process.env);
  return cached;
}

export function clearEnvCache(): void {
  cached = null;
}
