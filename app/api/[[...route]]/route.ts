import { Hono } from "hono";
import { handle } from "hono/vercel";

export const runtime = "edge";

const app = new Hono().basePath("/api");

app.get("/health", (c) =>
  c.json({ ok: true, runtime: "edge", ts: new Date().toISOString() })
);

app.post("/chat", (c) =>
  c.json(
    { error: "not_implemented", message: "Chat route is not yet implemented." },
    501
  )
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
