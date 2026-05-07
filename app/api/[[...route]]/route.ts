import { Hono } from "hono";
import { handle } from "hono/vercel";
import { streamText } from "ai";
import { z } from "zod";

import portfolioJson from "@/data/portfolio.sample.json";
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
import { addTokenUsage, checkDailyTokenBudget } from "@/lib/token-budget";
import type { PortfolioServerData } from "@/types/portfolio";

export const runtime = "edge";

const portfolioData = portfolioJson as unknown as PortfolioServerData;

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const ChatRequestSchema = z.object({
  modelId: z.string().optional(),
  messages: z.array(ChatMessageSchema).min(1).max(50),
});

export const app = new Hono().basePath("/api");

app.get("/health", (c) =>
  c.json({ ok: true, runtime: "edge", ts: new Date().toISOString() }),
);

app.post(
  "/chat",
  rateLimitMiddleware({ routeKey: "chat", perMinute: 10, perDay: 100 }),
  async (c) => {
  const budget = await checkDailyTokenBudget();
  if (!budget.ok) {
    const retryAfter = Math.max(
      1,
      Math.ceil((budget.resetAt - Date.now()) / 1000),
    );
    return c.json(
      { error: "daily_token_cap" },
      503,
      { "Retry-After": String(retryAfter) },
    );
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = ChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_request", issues: parsed.error.issues },
      400,
    );
  }

  const { modelId, messages } = parsed.data;
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
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

  const retrieval = retrieve(lastUser, portfolioData, { queryEmbedding });
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
    abortSignal: c.req.raw.signal,
  });

  const encoder = new TextEncoder();
  const filteredStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      try {
        for await (const delta of result.textStream) {
          buffer += delta;
          const idx = buffer.lastIndexOf("\n");
          if (idx === -1) continue;
          const safe = buffer.slice(0, idx + 1);
          buffer = buffer.slice(idx + 1);
          const filtered = filterOutput({
            text: safe,
            allowedSourceUrls,
          });
          controller.enqueue(encoder.encode(filtered.text));
        }
        if (buffer.length > 0) {
          const filtered = filterOutput({
            text: buffer,
            allowedSourceUrls,
          });
          controller.enqueue(encoder.encode(filtered.text));
        }
        try {
          const usage = await result.usage;
          const promptTokens =
            typeof usage?.inputTokens === "number" ? usage.inputTokens : 0;
          const completionTokens =
            typeof usage?.outputTokens === "number" ? usage.outputTokens : 0;
          if (promptTokens + completionTokens > 0) {
            await addTokenUsage({ promptTokens, completionTokens });
          }
        } catch (e) {
          console.warn(
            "[chat] addTokenUsage failed:",
            e instanceof Error ? e.message : "unknown",
          );
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
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
