import "server-only";

import { createHash } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import type {
  FeedbackError,
  FeedbackInput,
  FeedbackReason,
  FeedbackResult,
} from "@/types/feedback";

const NOTION_API = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";
const RICH_TEXT_LIMIT = 2000;
const TITLE_LIMIT = 100;
const DEFAULT_BACKOFF_MS = 1000;

const REASON_LABELS: Record<FeedbackReason, string> = {
  inaccurate: "정보가 정확하지 않아요",
  "off-topic": "내가 원한 답이 아니에요",
  incomplete: "관련 내용이 부족해요",
  other: "기타",
};

export interface AppendFeedbackOptions {
  backoffMs?: number;
}

export function chunkRichText(text: string): Array<{ text: { content: string } }> {
  if (!text) return [];
  const out: Array<{ text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_LIMIT) {
    out.push({ text: { content: text.slice(i, i + RICH_TEXT_LIMIT) } });
  }
  return out;
}

export async function hashUserAgent(ua: string): Promise<string> {
  return createHash("sha256").update(ua).digest("hex").slice(0, 8);
}

function buildProperties(input: FeedbackInput): Record<string, unknown> {
  const titleSource = (input.question || "").slice(0, TITLE_LIMIT) || "(no question)";
  return {
    Title: { title: chunkRichText(titleSource) },
    Question: { rich_text: chunkRichText(input.question) },
    Answer: { rich_text: chunkRichText(input.answer) },
    Reason: { select: { name: REASON_LABELS[input.reason] } },
    ReasonDetail: { rich_text: chunkRichText(input.reasonDetail ?? "") },
    Model: { select: { name: input.model } },
    RetrievalChunks: {
      rich_text: chunkRichText(input.retrievalChunkTitles.join(" | ")),
    },
    Status: { status: { name: "새" } },
    "UA hash": { rich_text: chunkRichText(input.uaHash) },
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

async function postOnce(
  token: string,
  databaseId: string,
  input: FeedbackInput,
): Promise<Response> {
  return fetch(NOTION_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: buildProperties(input),
    }),
  });
}

export async function appendFeedback(
  input: FeedbackInput,
  opts: AppendFeedbackOptions = {},
): Promise<FeedbackResult | FeedbackError> {
  const env = getServerEnv();

  if (env.MOCK_NOTION === "1") {
    return { ok: true, notionPageId: `mock-${input.messageId}` };
  }

  if (!env.NOTION_TOKEN || !env.NOTION_FEEDBACK_DB_ID) {
    return {
      ok: false,
      reason: "auth",
      message: "NOTION_TOKEN or NOTION_FEEDBACK_DB_ID not configured",
    };
  }

  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const token = env.NOTION_TOKEN;
  const dbId = env.NOTION_FEEDBACK_DB_ID;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await postOnce(token, dbId, input);
    } catch (err) {
      if (attempt === 0) {
        await sleep(backoffMs);
        continue;
      }
      return {
        ok: false,
        reason: "unknown",
        message: `network error: ${(err as Error).name}`,
      };
    }

    if (res.status === 429) {
      if (attempt === 0) {
        await sleep(backoffMs);
        continue;
      }
      return { ok: false, reason: "unknown", message: "Notion 429 after retry" };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "auth", message: `Notion ${res.status}` };
    }

    if (res.status === 400) {
      return { ok: false, reason: "schema", message: "Notion 400 schema mismatch" };
    }

    if (!res.ok) {
      return { ok: false, reason: "unknown", message: `Notion ${res.status}` };
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      return { ok: false, reason: "unknown", message: "Notion response missing id" };
    }
    return { ok: true, notionPageId: json.id };
  }

  return { ok: false, reason: "unknown", message: "appendFeedback unreachable" };
}
