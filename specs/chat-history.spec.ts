import { describe, it, expect, beforeEach } from "vitest";
import { loadChatHistory, saveChatHistory } from "@/lib/chat-history";

// TS-105: 채팅 이력 sessionStorage 영속화 (FEAT-045)
describe("chat-history (TS-105)", () => {
  beforeEach(() => sessionStorage.clear());

  it("저장 후 복원 — messages + citations 왕복", () => {
    const messages = [
      { id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "안녕" }] },
    ];
    const citationsById = { a1: [{ title: "T", url: "https://www.notion.so/x" }] };
    saveChatHistory({ messages, citationsById } as never);
    expect(loadChatHistory()).toEqual({ messages, citationsById });
  });

  it("저장 없음 / 깨진 JSON → null", () => {
    expect(loadChatHistory()).toBeNull();
    sessionStorage.setItem("portfolio.chat", "{broken");
    expect(loadChatHistory()).toBeNull();
  });

  it("빈 messages 저장 → 키 제거", () => {
    saveChatHistory({ messages: [{ id: "u1", role: "user", parts: [] }], citationsById: {} } as never);
    saveChatHistory({ messages: [], citationsById: {} });
    expect(sessionStorage.getItem("portfolio.chat")).toBeNull();
  });
});
