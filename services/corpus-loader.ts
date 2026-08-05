import { getServerEnv } from "@/lib/env";
import { loadPortfolio } from "@/lib/portfolio-data";
import type { PortfolioServerData } from "@/types/portfolio";

/**
 * 런타임 corpus 로더 (ADR-037, FEAT-038, TS-92).
 * Lambda 인제스천이 갱신하는 S3 corpus.json(임베딩 제외)을 10분 TTL 메모리 캐시로 읽어
 * 재배포 없이 노션 콘텐츠가 반영되게 한다. 미설정·장애·형식 불량은 전부
 * 커밋된 data/portfolio.server.json 폴백 — 응답은 계속된다.
 */

const TTL_MS = 10 * 60 * 1000;

export interface CorpusLoaderOptions {
  /** 테스트 주입용 — corpus.json 원문 문자열 반환. 기본은 S3 GetObject. */
  fetchCorpus?: () => Promise<string>;
  now?: () => number;
}

let cache: { data: PortfolioServerData; at: number } | null = null;

export function clearCorpusCache(): void {
  cache = null;
}

export async function loadRuntimeCorpus(
  opts: CorpusLoaderOptions = {},
): Promise<PortfolioServerData> {
  const env = getServerEnv();
  if (!env.CORPUS_S3_BUCKET) return loadPortfolio();

  const now = opts.now ?? Date.now;
  if (cache && now() - cache.at <= TTL_MS) return cache.data;

  try {
    const raw = await (opts.fetchCorpus ?? defaultFetchCorpus)();
    const data = parseCorpus(raw);
    cache = { data, at: now() };
    return data;
  } catch (err) {
    console.warn(
      "[corpus] S3 corpus unavailable, falling back to committed data:",
      err instanceof Error ? err.message : String(err),
    );
    const fallback = loadPortfolio();
    cache = { data: fallback, at: now() }; // 장애 중 매 요청 S3 재시도 방지 (TTL 후 재시도)
    return fallback;
  }
}

async function defaultFetchCorpus(): Promise<string> {
  const env = getServerEnv();
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { createAwsCredentialProvider } = await import("@/services/aws-credentials");
  const client = new S3Client({
    region: env.PORTFOLIO_AWS_REGION,
    credentials: createAwsCredentialProvider({
      roleArn: env.PORTFOLIO_AWS_ROLE_ARN,
      profile: env.PORTFOLIO_AWS_PROFILE,
    }),
  });
  const out = await client.send(
    new GetObjectCommand({ Bucket: env.CORPUS_S3_BUCKET, Key: env.CORPUS_S3_KEY }),
  );
  const body = await out.Body?.transformToString("utf-8");
  if (!body) throw new Error("empty corpus body");
  return body;
}

function parseCorpus(raw: string): PortfolioServerData {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.version !== "string" ||
    typeof parsed.generatedAt !== "string" ||
    !Array.isArray(parsed.chunks) ||
    parsed.chunks.length === 0 ||
    !Array.isArray(parsed.suggestedQuestions) ||
    typeof parsed.profile !== "object"
  ) {
    throw new Error("invalid corpus shape");
  }
  const chunks = (parsed.chunks as Array<Record<string, unknown>>).map((c, i) => {
    if (typeof c.id !== "string" || typeof c.text !== "string") {
      throw new Error(`invalid corpus chunk[${i}]`);
    }
    // corpus 는 임베딩 미보유 — 벡터 점수는 S3 Vectors(vectorScores 경로)가 공급 (ADR-037)
    return { ...c, embedding: [] } as unknown as PortfolioServerData["chunks"][number];
  });
  return {
    version: parsed.version,
    generatedAt: parsed.generatedAt,
    chunks,
    suggestedQuestions:
      parsed.suggestedQuestions as unknown as PortfolioServerData["suggestedQuestions"],
    profile: parsed.profile as unknown as PortfolioServerData["profile"],
  };
}
