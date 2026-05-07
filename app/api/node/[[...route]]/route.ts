import { Hono } from "hono";
import { handle } from "hono/vercel";
import { z } from "zod";

import { appendFeedback, hashUserAgent } from "@/services/notion-feedback";

export const runtime = "nodejs";

export const app = new Hono().basePath("/api/node");

const FeedbackBodySchema = z.object({
  messageId: z.string().min(1).max(100),
  question: z.string().min(1).max(4000),
  answer: z.string().min(1).max(8000),
  reason: z.enum(["inaccurate", "off-topic", "incomplete", "other"]),
  reasonDetail: z.string().max(500).optional(),
  model: z.string().min(1).max(50),
  retrievalChunkTitles: z.array(z.string().max(200)).max(20).default([]),
});

const FEEDBACK_RETRY_DELAY_MS = 1000;

app.get("/health", (c) => c.json({ ok: true, runtime: "node", ts: new Date().toISOString() }));

app.post("/feedback", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const parsed = FeedbackBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_request", issues: parsed.error.issues },
      400,
    );
  }

  const ua = c.req.header("user-agent") ?? "";
  const uaHash = await hashUserAgent(ua);

  let res = await appendFeedback({ ...parsed.data, uaHash });

  if (!res.ok && res.reason === "unknown") {
    await new Promise((r) => setTimeout(r, FEEDBACK_RETRY_DELAY_MS));
    res = await appendFeedback({ ...parsed.data, uaHash });
  }

  if (res.ok) {
    return c.json({ ok: true, notionPageId: res.notionPageId }, 200);
  }

  switch (res.reason) {
    case "auth":
      return c.json({ error: "feedback_unavailable" }, 503);
    case "schema":
      return c.json({ error: "feedback_invalid" }, 422);
    default:
      return c.json({ error: "feedback_failed" }, 502);
  }
});

app.post("/contact", (c) => c.json({ error: "not_implemented" }, 501));

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("[node api error]", err.name);
  return c.json({ error: "internal_error" }, 500);
});

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
