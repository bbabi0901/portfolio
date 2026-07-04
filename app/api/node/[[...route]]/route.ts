import { Hono } from "hono";
import { handle } from "hono/vercel";
import { z } from "zod";

import { rateLimitMiddleware } from "@/lib/rate-limit-middleware";
import { appendFeedback, hashUserAgent } from "@/services/notion-feedback";
import { ContactSchema } from "@/lib/contact-schema";
import { appendContact } from "@/services/notion-contact";
import { notifyContactReceived } from "@/services/resend";
import { getServerEnv } from "@/lib/env";

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

app.post(
  "/feedback",
  rateLimitMiddleware({ routeKey: "feedback", perMinute: 5, perDay: 30 }),
  async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }

    const parsed = FeedbackBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
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
  },
);

const OWNER_EMAIL = "bbabi0901@gmail.com";

// At route level, accept any website value (honeypot detection happens after parse)
const ContactBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  email: z.string().trim().email(),
  message: z.string().trim().min(10).max(2000),
  website: z.string().optional(),
  elapsedMs: z.number().optional(),
});

app.post(
  "/contact",
  rateLimitMiddleware({ routeKey: "contact", perMinute: 3, perDay: 10 }),
  async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }

    const parsed = ContactBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    }

    const { name, email, message, website, elapsedMs } = parsed.data;

    // Honeypot: bot filled the hidden field
    if (website && website.length > 0) {
      return c.json({ ok: true, _silent: true }, 200);
    }

    // Speed check: too fast = bot
    if (elapsedMs !== undefined && elapsedMs < 1500) {
      return c.json({ error: "too_fast" }, 422);
    }

    const uaHash = await hashUserAgent(c.req.header("user-agent") ?? "");

    const res = await appendContact({ name, email, message, uaHash });

    if (res.ok) {
      // Fire-and-forget email notification if RESEND configured
      const env = getServerEnv();
      if (env.RESEND_API_KEY) {
        void notifyContactReceived({
          toEmail: env.RESEND_TO_EMAIL ?? OWNER_EMAIL,
          fromName: name,
          fromEmail: email,
          message,
        });
      }
      return c.json({ ok: true, channel: "notion" }, 200);
    }

    if (res.reason === "not-configured") {
      return c.json({ error: "contact_not_configured", mailto: `mailto:${OWNER_EMAIL}` }, 503);
    }

    // Notion failed — try Resend fallback
    const env = getServerEnv();
    if (env.RESEND_API_KEY) {
      const resendRes = await notifyContactReceived({
        toEmail: env.RESEND_TO_EMAIL ?? OWNER_EMAIL,
        fromName: name,
        fromEmail: email,
        message,
      });
      if (resendRes.ok) {
        return c.json({ ok: true, channel: "resend" }, 200);
      }
    }

    return c.json({ error: "contact_failed", mailto: `mailto:${OWNER_EMAIL}` }, 502);
  },
);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("[node api error]", err.name);
  return c.json({ error: "internal_error" }, 500);
});

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
