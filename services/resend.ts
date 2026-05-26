import "server-only";

import { getServerEnv } from "@/lib/env";

const RESEND_API = "https://api.resend.com/emails";

export interface ResendNotificationInput {
  toEmail: string;
  fromName: string;
  fromEmail: string;
  message: string;
}

export interface ResendOk {
  ok: true;
  id: string;
}

export interface ResendErr {
  ok: false;
  reason: "not-configured" | "auth" | "unknown";
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

function siteHostFallback(siteUrl: string | undefined): string {
  if (!siteUrl) return "portfolio.local";
  try {
    return new URL(siteUrl).host || "portfolio.local";
  } catch {
    return "portfolio.local";
  }
}

function buildHtml(fromName: string, fromEmail: string, message: string): string {
  const safeName = escapeHtml(fromName);
  const safeEmail = escapeHtml(fromEmail);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  return [
    "<div>",
    `<p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>`,
    "<hr>",
    `<div>${safeMessage}</div>`,
    "</div>",
  ].join("");
}

export async function notifyContactReceived(
  input: ResendNotificationInput,
): Promise<ResendOk | ResendErr> {
  const env = getServerEnv();

  if (env.MOCK_NOTION === "1" || env.MOCK_LLM === "1") {
    return { ok: true, id: `mock-resend-${Date.now()}` };
  }

  if (!env.RESEND_API_KEY) {
    return { ok: false, reason: "not-configured" };
  }

  const fromAddress =
    env.RESEND_FROM_EMAIL ?? `noreply@${siteHostFallback(env.NEXT_PUBLIC_SITE_URL)}`;

  const body = {
    from: fromAddress,
    to: input.toEmail,
    subject: `[Contact] ${input.fromName}`,
    html: buildHtml(input.fromName, input.fromEmail, input.message),
  };

  let res: Response;
  try {
    res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "unknown" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "auth" };
  }

  if (!res.ok) {
    return { ok: false, reason: "unknown" };
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!json.id) {
    return { ok: false, reason: "unknown" };
  }
  return { ok: true, id: json.id };
}
