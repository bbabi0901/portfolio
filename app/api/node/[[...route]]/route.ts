import { Hono } from "hono";
import { handle } from "hono/vercel";

export const runtime = "nodejs";

const app = new Hono().basePath("/api/node");

app.get("/health", (c) => c.json({ ok: true, runtime: "node", ts: new Date().toISOString() }));

app.post("/feedback", (c) => c.json({ error: "not_implemented" }, 501));

app.post("/contact", (c) => c.json({ error: "not_implemented" }, 501));

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("[node api error]", err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
