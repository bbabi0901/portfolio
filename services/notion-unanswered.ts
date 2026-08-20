import "server-only";

import { getServerEnv } from "@/lib/env";

const NOTION_API = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";
const TITLE_LIMIT = 200;
// icn1 → Notion API(US) 콜드 왕복이 1.5s 를 넘겨 무음 실패했던 실사례 — 여유 있게
const TIMEOUT_MS = 5000;

export interface LogUnansweredOptions {
  /** 테스트 주입용 */
  fetchFn?: typeof fetch;
}

/**
 * 미답변 질문 수집 (FEAT-043, TS-102) — ERR-08(검색 0건) 질문을 노션 "미답변 질문" DB 에
 * 기록해 콘텐츠 갭 개선 루프를 만든다. 미설정·실패·타임아웃 전부 무해(false 반환) —
 * 수집이 죽어도 챗 응답은 영향 없다.
 */
export async function logUnansweredQuestion(
  question: string,
  opts: LogUnansweredOptions = {},
): Promise<boolean> {
  const env = getServerEnv();
  if (env.MOCK_NOTION === "1") return false; // 테스트/CI 에서 실 노션 오염 방지 (타 노션 서비스와 동일 가드)
  if (!env.NOTION_TOKEN || !env.NOTION_UNANSWERED_DB_ID) return false;
  const fetchFn = opts.fetchFn ?? fetch;
  try {
    const res = await fetchFn(NOTION_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        parent: { database_id: env.NOTION_UNANSWERED_DB_ID },
        properties: {
          질문: { title: [{ text: { content: question.slice(0, TITLE_LIMIT) } }] },
          처리: { select: { name: "대기" } },
        },
      }),
    });
    if (!res.ok) {
      console.warn("[unanswered] notion write failed:", res.status);
    }
    return res.ok;
  } catch (err) {
    console.warn(
      "[unanswered] notion write error:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
