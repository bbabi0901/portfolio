import type { UIMessage } from "ai";
import type { Citation } from "@/types/chat";

// FEAT-045: 메뉴 이동 → 뒤로가기 시 ChatRoot 가 재마운트돼도 대화가 남도록 탭 단위(sessionStorage) 보관.
const STORAGE_KEY = "portfolio.chat";

export interface ChatHistory {
  messages: UIMessage[];
  citationsById: Record<string, Citation[]>;
}

export function loadChatHistory(): ChatHistory | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatHistory;
    return Array.isArray(parsed?.messages) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveChatHistory(history: ChatHistory): void {
  try {
    if (history.messages.length === 0) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore (quota / private mode)
  }
}
