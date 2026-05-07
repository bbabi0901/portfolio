import { http, HttpResponse } from "msw";

const NOTION_BASE = "https://api.notion.com";

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

export const handlers = [...notionHandlers];
