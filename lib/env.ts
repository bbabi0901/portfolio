import { z } from "zod";

const ServerEnvSchema = z.object({
  // OpenRouter — 단일 키로 OpenAI/Anthropic/Google 통합 (ADR-026)
  // 채팅 모델 라우팅 전용. 임베딩은 OPENAI_API_KEY 사용.
  OPENROUTER_API_KEY: z.string().optional(),
  // 임베딩 전용 (OpenRouter는 /v1/embeddings 미지원), sync:notion 빌드 타임만 사용
  // VOYAGE_API_KEY 우선 (무료 50M tokens/월), 없으면 OPENAI_API_KEY 폴백 (ADR-026)
  VOYAGE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  NOTION_FEEDBACK_DB_ID: z.string().optional(),
  NOTION_CONTACT_DB_ID: z.string().optional(),
  NOTION_TROUBLESHOOTING_DB_ID: z.string().optional(),
  NOTION_EXTRA_PAGE_IDS: z.string().optional(),
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
  // AWS — Bedrock 챗 LLM (ADR-034). Vercel 이 AWS_ prefix 를 예약하므로 커스텀명.
  PORTFOLIO_AWS_REGION: z.string().default("ap-northeast-2"),
  // Vercel OIDC federation 으로 assume 할 IAM 역할 (프로덕션 자격 증명)
  PORTFOLIO_AWS_ROLE_ARN: z.string().optional(),
  // 로컬 dev/smoke 용 AWS 프로필명 (aws login 결과 재사용)
  PORTFOLIO_AWS_PROFILE: z.string().optional(),
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
