import { Hono } from "hono";
import { handle } from "hono/vercel";
import { streamText } from "ai";
import { z } from "zod";

import portfolioJson from "@/data/portfolio.server.json";
import { fixtureEmbedding } from "@/lib/embeddings";
import { getServerEnv } from "@/lib/env";
import {
  createModel,
  DEFAULT_MODEL_ID,
  isKnownModel,
  listAvailableModels,
  resolveModel,
} from "@/lib/models";
import { filterOutput } from "@/lib/output-filter";
import {
  buildSystemPrompt,
  detectLanguage,
  NO_RECORD_RESPONSE_EN,
  NO_RECORD_RESPONSE_KO,
} from "@/lib/prompts";
import { rateLimitMiddleware } from "@/lib/rate-limit-middleware";
import { retrieve } from "@/lib/retriever";
import { createBedrockEmbeddingsService } from "@/services/bedrock-embeddings";
import { createVectorStore, type VectorStore } from "@/services/s3-vectors";
import { addTokenUsage, checkDailyTokenBudget } from "@/lib/token-budget";
import type { PortfolioServerData } from "@/types/portfolio";

// Edge 1MB 번들 한도로 커밋된 RAG 데이터(server.json)를 담을 수 없어 Node 로 이전 (ADR-031)
export const runtime = "nodejs";

const portfolioData = portfolioJson as unknown as PortfolioServerData;

// 런타임 벡터 검색 (ADR-034 Phase 3) — 함수 인스턴스당 1회 생성 (lazy)
const VECTOR_TIMEOUT_MS = 800;
let vectorStoreSingleton: VectorStore | null = null;
let embedSingleton: ((text: string) => Promise<number[]>) | null = null;

/**
 * 질문 임베딩(Titan) → S3 Vectors 질의 → chunkId→score 맵.
 * 실패·타임아웃·미설정은 전부 undefined = keyword-only 강등 (ERR-14, X-Retrieval-Mode 로 노출).
 */
async function fetchVectorScores(query: string): Promise<Map<string, number> | undefined> {
  const env = getServerEnv();
  if (!env.S3_VECTORS_BUCKET) return undefined;
  try {
    vectorStoreSingleton ??= createVectorStore({
      region: env.PORTFOLIO_AWS_REGION,
      bucket: env.S3_VECTORS_BUCKET,
      index: env.S3_VECTORS_INDEX,
      credentialProvider: (await import("@/services/aws-credentials")).createAwsCredentialProvider({
        roleArn: env.PORTFOLIO_AWS_ROLE_ARN,
        profile: env.PORTFOLIO_AWS_PROFILE,
      }),
    });
    embedSingleton ??= (() => {
      const svc = createBedrockEmbeddingsService({
        region: env.PORTFOLIO_AWS_REGION,
        roleArn: env.PORTFOLIO_AWS_ROLE_ARN,
        profile: env.PORTFOLIO_AWS_PROFILE,
      });
      return (text: string) => svc.embed(text);
    })();
    const scores = await Promise.race([
      (async () => {
        const embedding = await embedSingleton!(query);
        const matches = await vectorStoreSingleton!.query(embedding, { topK: 16 });
        return new Map(matches.map((m) => [m.chunkId, m.score]));
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`vector search timeout ${VECTOR_TIMEOUT_MS}ms`)),
          VECTOR_TIMEOUT_MS,
        ),
      ),
    ]);
    return scores;
  } catch (err) {
    // ERR-14 — 벡터 경로 장애는 keyword-only 로 강등, 응답은 계속된다
    console.warn(
      "[chat] vector search degraded to keyword-only:",
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const ChatRequestSchema = z.object({
  modelId: z.string().optional(),
  messages: z.array(ChatMessageSchema).min(1).max(50),
});

export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, runtime: "nodejs", ts: new Date().toISOString() }));

app.post(
  "/chat",
  rateLimitMiddleware({ routeKey: "chat", perMinute: 10, perDay: 100 }),
  async (c) => {
    const budget = await checkDailyTokenBudget();
    if (!budget.ok) {
      const retryAfter = Math.max(1, Math.ceil((budget.resetAt - Date.now()) / 1000));
      return c.json({ error: "daily_token_cap" }, 503, { "Retry-After": String(retryAfter) });
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = ChatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    }

    const { modelId, messages } = parsed.data;
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (lastUser.trim().length === 0) {
      return c.json({ error: "empty_message" }, 400);
    }

    const requestedId = modelId ?? DEFAULT_MODEL_ID;
    let spec = resolveModel(requestedId);
    let substitution = !isKnownModel(requestedId);

    let model;
    try {
      model = createModel(spec);
    } catch {
      const available = listAvailableModels();
      if (available.length === 0) {
        return c.json({ error: "no_models_available" }, 503);
      }
      spec = available[0]!;
      substitution = true;
      try {
        model = createModel(spec);
      } catch {
        return c.json({ error: "no_models_available" }, 503);
      }
    }

    const env = getServerEnv();
    const dim = portfolioData.chunks[0]?.embedding.length;
    const queryEmbedding =
      env.MOCK_LLM === "1" && dim ? fixtureEmbedding(lastUser, dim) : undefined;
    // 실모드: S3 Vectors 로 하이브리드 점등 (MOCK 은 fixture 로컬 코사인 경로 유지 — CI 결정성)
    const vectorScores = queryEmbedding ? undefined : await fetchVectorScores(lastUser);

    const retrieval = retrieve(lastUser, portfolioData, { queryEmbedding, vectorScores });
    const chunks = retrieval.results.map((r) => r.chunk);
    const language = detectLanguage(lastUser);

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Retrieval-Mode": retrieval.mode,
      "X-Model-Id": spec.id,
    };
    if (substitution) headers["X-Model-Substitution"] = "true";

    if (chunks.length === 0) {
      const text = language === "en" ? NO_RECORD_RESPONSE_EN : NO_RECORD_RESPONSE_KO;
      return new Response(text, { headers });
    }

    const system = buildSystemPrompt({ chunks, language });
    const allowedSourceUrls = chunks.map((ch) => ch.sourceUrl);

    const result = streamText({
      model,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      maxOutputTokens: spec.maxOutputTokens,
      temperature: spec.temperature,
      topP: spec.topP,
    });

    // 스트림 개시 프로브 — 첫 text-delta 전에 error 파트가 오면 503 으로 표면화 (ERR-05/TS-89).
    // textStream 은 에러를 throw 하지 않고 조용히 종료해 NO_RECORD 200 으로 위장됐으므로
    // (프로덕션 OIDC 장애가 이렇게 은폐됨) error 파트가 보이는 fullStream 을 소비한다.
    const iterator = result.fullStream[Symbol.asyncIterator]();
    let firstText: string | null = null;
    let startError: unknown = null;
    while (firstText === null && startError === null) {
      const r = await iterator.next();
      if (r.done) break; // 텍스트 없이 정상 종료 — 빈 응답 폴백 경로로
      if (r.value.type === "error") startError = r.value.error;
      else if (r.value.type === "text-delta") firstText = r.value.text;
    }
    if (startError !== null) {
      console.error(
        "[chat] stream start failed:",
        startError instanceof Error ? startError.message : String(startError),
      );
      return c.json({ error: "no_models_available" }, 503);
    }

    const encoder = new TextEncoder();
    const filteredStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let bytesWritten = 0;
        let midStreamError = false;
        const emit = (text: string) => {
          const filtered = filterOutput({ text, allowedSourceUrls });
          const encoded = encoder.encode(filtered.text);
          controller.enqueue(encoded);
          bytesWritten += encoded.length;
        };
        try {
          if (firstText !== null) emit(firstText);
          if (firstText !== null) {
            for (;;) {
              const r = await iterator.next();
              if (r.done) break;
              if (r.value.type === "error") {
                // mid-stream 에러 — 이미 200 이 나간 뒤라 상태코드 변경 불가. 로그 후 종료(부분 응답 유지).
                midStreamError = true;
                const e = r.value.error;
                console.error("[chat] stream error:", e instanceof Error ? e.message : String(e));
                break;
              }
              if (r.value.type === "text-delta") emit(r.value.text);
            }
          }
        } catch (err) {
          midStreamError = true;
          console.error("[chat] stream error:", err instanceof Error ? err.message : String(err));
        } finally {
          if (bytesWritten === 0 && !midStreamError) {
            // 에러 없이 정상 종료된 0바이트 스트림(모델이 진짜 빈 응답)만 fallback — 빈 버블 방지
            const fallback = language === "en" ? NO_RECORD_RESPONSE_EN : NO_RECORD_RESPONSE_KO;
            controller.enqueue(encoder.encode(fallback));
          }
          controller.close();
        }
        // textStream 소비 완료 후 usage 접근 — tee 충돌 없음
        // result.usage 는 PromiseLike 라 Promise.resolve 로 감싸 .catch 체이닝 보장
        Promise.resolve(result.usage)
          .then((usage) => {
            const promptTokens = typeof usage?.inputTokens === "number" ? usage.inputTokens : 0;
            const completionTokens =
              typeof usage?.outputTokens === "number" ? usage.outputTokens : 0;
            if (promptTokens + completionTokens > 0) {
              addTokenUsage({ promptTokens, completionTokens }).catch((e: unknown) =>
                console.warn(
                  "[chat] addTokenUsage failed:",
                  e instanceof Error ? e.message : "unknown",
                ),
              );
            }
          })
          .catch((e: unknown) =>
            console.warn(
              "[chat] usage tracking failed:",
              e instanceof Error ? e.message : "unknown",
            ),
          );
      },
    });

    return new Response(filteredStream, { headers });
  },
);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("[edge api error]", err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
