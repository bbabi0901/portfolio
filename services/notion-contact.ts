import "server-only";

import { getServerEnv } from "@/lib/env";
import { chunkRichText } from "@/services/notion-feedback";
import type { ContactInput } from "@/lib/contact-schema";

const NOTION_API = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";
const NAME_TITLE_LIMIT = 60;

export interface ContactSavedResult {
  ok: true;
  notionPageId: string;
}

export interface ContactErrorResult {
  ok: false;
  reason: "auth" | "schema" | "unknown" | "not-configured";
  message: string;
}

export type ContactSaveInput = Pick<ContactInput, "name" | "email" | "message"> & {
  uaHash: string;
};

function buildProperties(input: ContactSaveInput): Record<string, unknown> {
  const titleSource = input.name.slice(0, NAME_TITLE_LIMIT) || "(no name)";
  return {
    Title: { title: chunkRichText(titleSource) },
    Email: { email: input.email },
    Message: { rich_text: chunkRichText(input.message) },
    "UA hash": { rich_text: chunkRichText(input.uaHash) },
    Status: { status: { name: "새" } },
  };
}

export async function appendContact(
  input: ContactSaveInput,
): Promise<ContactSavedResult | ContactErrorResult> {
  const env = getServerEnv();

  if (env.MOCK_NOTION === "1") {
    return { ok: true, notionPageId: `mock-contact-${input.uaHash}` };
  }

  if (!env.NOTION_CONTACT_DB_ID) {
    return {
      ok: false,
      reason: "not-configured",
      message: "NOTION_CONTACT_DB_ID not configured",
    };
  }

  if (!env.NOTION_TOKEN) {
    return {
      ok: false,
      reason: "auth",
      message: "NOTION_TOKEN not configured",
    };
  }

  let res: Response;
  try {
    res = await fetch(NOTION_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: env.NOTION_CONTACT_DB_ID },
        properties: buildProperties(input),
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "unknown",
      message: `network error: ${(err as Error).name}`,
    };
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
