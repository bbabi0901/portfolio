import { http, HttpResponse } from "msw";

import { fixtureEmbedding } from "@/lib/embeddings";

const NOTION_BASE = "https://api.notion.com";
const OPENAI_BASE = "https://api.openai.com";

export const notionHandlers = [
  http.post(`${NOTION_BASE}/v1/databases/:databaseId/query`, () =>
    HttpResponse.json({ results: [], next_cursor: null, has_more: false }),
  ),
  http.get(`${NOTION_BASE}/v1/pages/:pageId`, ({ params }) =>
    HttpResponse.json({ id: params.pageId, properties: {} }),
  ),
  http.get(`${NOTION_BASE}/v1/blocks/:blockId/children`, () =>
    HttpResponse.json({ results: [], next_cursor: null, has_more: false }),
  ),
];

export const openaiHandlers = [
  http.post(`${OPENAI_BASE}/v1/embeddings`, async ({ request }) => {
    const body = (await request.json()) as {
      input: string | string[];
      dimensions?: number;
      model?: string;
    };
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const dim = body.dimensions ?? 1536;
    return HttpResponse.json({
      object: "list",
      data: inputs.map((t, i) => ({
        object: "embedding",
        index: i,
        embedding: fixtureEmbedding(t, dim),
      })),
      model: body.model ?? "text-embedding-3-small",
      usage: { prompt_tokens: 0, total_tokens: 0 },
    });
  }),
];

export const handlers = [...notionHandlers, ...openaiHandlers];
