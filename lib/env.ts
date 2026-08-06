import { z } from "zod";

const ServerEnvSchema = z.object({
  // 챗·임베딩은 전부 Bedrock (ADR-034)
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
  // S3 Vectors (ADR-034 Phase 3) — 미설정 시 벡터 검색 비활성 (keyword-only)
  S3_VECTORS_BUCKET: z.string().optional(),
  S3_VECTORS_INDEX: z.string().default("portfolio-chunks"),
  // 런타임 corpus.json 소스 버킷 (ADR-037 Phase 4) — 미설정 시 커밋 데이터 사용
  CORPUS_S3_BUCKET: z.string().optional(),
  CORPUS_S3_KEY: z.string().default("corpus.json"),
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
