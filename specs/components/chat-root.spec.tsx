import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { ChatRootProps } from "@/components/chat/ChatRoot";
import type { GreetingConfig } from "@/components/chat/GreetingPlayer";
import type { SuggestedQuestionMeta } from "@/types/portfolio";
import type { ModelId } from "@/components/chat/ModelSwitcher";

interface MockState {
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    parts: Array<{ type: "text"; text: string }>;
  }>;
  status: "ready" | "submitted" | "streaming" | "error";
  error: Error | undefined;
  sendMessage: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setMessages: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
  regenerate: ReturnType<typeof vi.fn>;
}

const mockState: MockState = {
  messages: [],
  status: "ready",
  error: undefined,
  sendMessage: vi.fn(),
  stop: vi.fn(),
  setMessages: vi.fn(),
  clearError: vi.fn(),
  regenerate: vi.fn(),
};

const transportInstances: Array<{
  fetch?: (...args: unknown[]) => Promise<Response>;
}> = [];

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: mockState.messages,
    sendMessage: mockState.sendMessage,
    stop: mockState.stop,
    setMessages: mockState.setMessages,
    clearError: mockState.clearError,
    regenerate: mockState.regenerate,
    status: mockState.status,
    error: mockState.error,
    id: "test-chat",
    addToolResult: vi.fn(),
    addToolOutput: vi.fn(),
    addToolApprovalResponse: vi.fn(),
    resumeStream: vi.fn(),
  }),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("ai");
  class MockTransport {
    fetch?: (...args: unknown[]) => Promise<Response>;
    constructor(opts: { fetch?: (...args: unknown[]) => Promise<Response> }) {
      this.fetch = opts.fetch;
      transportInstances.push(this);
    }
  }
  return {
    ...actual,
    TextStreamChatTransport: MockTransport,
  };
});

const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { ChatRoot } from "@/components/chat/ChatRoot";
import { __resetGreetingFallback } from "@/lib/greeting";

const baseGreeting: GreetingConfig = {
  message: "안녕하세요!",
  typingDelayMs: 600,
  wordIntervalMs: [30, 50],
  rememberDays: 30,
};

const baseSuggestions: SuggestedQuestionMeta[] = [
  {
    id: "Q-001",
    category: "intro",
    text: "김윤수 어떤 개발자예요?",
    expectedSourceTitles: [],
  },
  {
    id: "Q-002",
    category: "intro",
    text: "커리어 어떻게 시작했어요?",
    expectedSourceTitles: [],
  },
];

const allModels: ModelId[] = [
  "gpt-4o-mini",
  "claude-3-5-haiku-latest",
  "gemini-2.0-flash-exp",
];

function renderChat(overrides: Partial<ChatRootProps> = {}) {
  const props: ChatRootProps = {
    greeting: baseGreeting,
    suggestions: baseSuggestions,
    availableModels: allModels,
    defaultModelId: "gpt-4o-mini",
    ...overrides,
  };
  return render(<ChatRoot {...props} />);
}

beforeEach(() => {
  mockState.messages = [];
  mockState.status = "ready";
  mockState.error = undefined;
  mockState.sendMessage = vi.fn();
  mockState.stop = vi.fn();
  mockState.setMessages = vi.fn();
  mockState.clearError = vi.fn();
  mockState.regenerate = vi.fn();
  transportInstances.length = 0;
  toastWarning.mockReset();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  __resetGreetingFallback();
  // Mark as recently greeted so simulation skips immediately by default in most tests
  localStorage.setItem("portfolio.greeted", String(Date.now()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatRoot", () => {
  it("초기 진입 + 최근 인사 storage 있음 → greeting 즉시 done + EmptyState 사라짐", async () => {
    const { container } = renderChat();
    await waitFor(() => {
      const bubbles = container.querySelectorAll('[data-slot="message-bubble"]');
      expect(bubbles.length).toBeGreaterThanOrEqual(1);
    });
    const bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble!.getAttribute("data-status")).toBe("done");
  });

  it("ModelSwitcher 변경 → localStorage 저장", async () => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
    const user = userEvent.setup();
    renderChat();
    const trigger = screen.getByRole("combobox", { name: /답변 모델/ });
    await user.click(trigger);
    const opt = await screen.findByRole("option", { name: /Claude/i });
    await user.click(opt);
    expect(localStorage.getItem("portfolio.model")).toBe("claude-3-5-haiku-latest");
  });

  it("페이지 로드 시 localStorage 의 모델 ID 복원 (available 안에 있으면)", () => {
    localStorage.setItem("portfolio.model", "gemini-2.0-flash-exp");
    renderChat();
    const trigger = screen.getByRole("combobox", { name: /답변 모델/ });
    expect(trigger.textContent).toContain("Gemini");
  });

  it("저장된 모델 ID가 available 에 없으면 default 사용", () => {
    localStorage.setItem("portfolio.model", "claude-3-5-haiku-latest");
    renderChat({ availableModels: ["gpt-4o-mini"] });
    const trigger = screen.getByRole("combobox", { name: /답변 모델/ });
    expect(trigger.textContent).toContain("GPT");
  });

  it("availableModels=[] 시 ModelSwitcher disabled + 채팅 disabled + Composer placeholder 변경", () => {
    renderChat({ availableModels: [] });
    expect(screen.getByRole("combobox", { name: /답변 모델/ })).toBeDisabled();
    expect(
      screen.getByPlaceholderText("지금은 사용할 수 있는 모델이 없어요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /전송/ })).toBeDisabled();
  });

  it("추천 질문 badge 클릭 → sendMessage({ text }) 호출 + visited 표시", async () => {
    const user = userEvent.setup();
    const { container } = renderChat();
    const badge = await screen.findByRole("button", { name: /김윤수 어떤 개발자/ });
    await user.click(badge);
    expect(mockState.sendMessage).toHaveBeenCalledWith(
      { text: "김윤수 어떤 개발자예요?" },
      expect.objectContaining({ body: { modelId: "gpt-4o-mini" } }),
    );
    const visitedBadge = container.querySelector('[data-visited="true"]');
    expect(visitedBadge).not.toBeNull();
  });

  it("응답 도중 사용자 새 질문 → stop() 호출 후 sendMessage", async () => {
    mockState.status = "streaming";
    const { rerender } = renderChat();
    // simulate user sending while streaming via direct invocation in composer
    // The composer is disabled while streaming, so test stop+send via suggestion path
    // First let UI render
    const btn = screen.queryByRole("button", { name: /김윤수 어떤 개발자/ });
    if (btn) fireEvent.click(btn);
    expect(mockState.stop).toHaveBeenCalled();
    expect(mockState.sendMessage).toHaveBeenCalled();
    rerender(<div />);
  });

  it("새 대화 버튼 클릭 → confirm popover 표시 + 확인 시 setMessages([])", async () => {
    const user = userEvent.setup();
    renderChat();
    const trigger = screen.getByRole("button", { name: /새 대화/ });
    await user.click(trigger);
    expect(await screen.findByText("대화를 모두 지울까요?")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "지우기" });
    await user.click(confirm);
    expect(mockState.setMessages).toHaveBeenCalledWith([]);
  });

  it("Cmd+K 단축키 → clear popover 토글", async () => {
    renderChat();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByText("대화를 모두 지울까요?")).toBeInTheDocument();
  });

  it("status='submitted' → 마지막에 typing 메시지 추가", () => {
    mockState.status = "submitted";
    mockState.messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ];
    const { container } = renderChat();
    const bubbles = container.querySelectorAll('[data-slot="message-bubble"]');
    const last = bubbles[bubbles.length - 1];
    expect(last!.getAttribute("data-status")).toBe("typing");
  });

  it("status='streaming' → 마지막 assistant 메시지 status='streaming'", () => {
    mockState.status = "streaming";
    mockState.messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
      },
    ];
    const { container } = renderChat();
    const bubbles = container.querySelectorAll('[data-slot="message-bubble"]');
    const last = bubbles[bubbles.length - 1];
    expect(last!.getAttribute("data-role")).toBe("assistant");
    expect(last!.getAttribute("data-status")).toBe("streaming");
  });

  it("error 상태 → ErrorState 표시", () => {
    mockState.error = new Error("HTTP 503 no_models_available");
    const { container } = renderChat();
    expect(container.querySelector('[data-slot="error-state"]')).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("모델이 없어요");
  });

  it("error 429 → ErrorState + 카운트다운 표시", () => {
    mockState.error = new Error("HTTP 429 retry-after:5");
    const { container } = renderChat();
    expect(container.querySelector('[data-slot="error-state"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="error-countdown"]')!.textContent).toMatch(
      /5|4|3/,
    );
  });

  it("transport 의 custom fetch: X-Model-Substitution 헤더 시 toast.warning 호출", async () => {
    renderChat();
    const tx = transportInstances[0];
    expect(tx?.fetch).toBeTypeOf("function");
    const realFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("ok", {
          status: 200,
          headers: { "X-Model-Substitution": "true" },
        }),
      );
    try {
      const res = await tx!.fetch!("/api/chat", { method: "POST" });
      expect(res).toBeInstanceOf(Response);
      expect(toastWarning).toHaveBeenCalledTimes(1);
    } finally {
      realFetch.mockRestore();
    }
  });

  it("transport 의 custom fetch: 응답 !ok 일 경우 throw", async () => {
    renderChat();
    const tx = transportInstances[0];
    expect(tx?.fetch).toBeTypeOf("function");
    const realFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("err", {
          status: 503,
        }),
      );
    try {
      await expect(tx!.fetch!("/api/chat", { method: "POST" })).rejects.toThrow(
        /HTTP 503/,
      );
    } finally {
      realFetch.mockRestore();
    }
  });

  it("Composer 로 메시지 전송 → sendMessage({ text }) 호출", async () => {
    const user = userEvent.setup();
    renderChat();
    const ta = screen.getByRole("textbox");
    await user.type(ta, "hello");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(mockState.sendMessage).toHaveBeenCalledWith(
      { text: "hello" },
      expect.objectContaining({ body: { modelId: "gpt-4o-mini" } }),
    );
  });

  it("스크롤이 거리 100px 이내이면 stuckBottom=true → JumpToLatest 미표시", () => {
    renderChat();
    expect(screen.queryByRole("button", { name: /최신 메시지로 이동/ })).toBeNull();
  });

  it("스크롤 위로 → stuckBottom=false → JumpToLatest 표시", () => {
    const { container } = renderChat();
    const scroller = container.querySelector('[data-slot="chat-scroll"]') as HTMLDivElement;
    expect(scroller).not.toBeNull();
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scroller, "scrollTop", { configurable: true, value: 100 });
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: /최신 메시지로 이동/ })).toBeInTheDocument();
  });
});
