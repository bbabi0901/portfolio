import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChatMessage, Citation } from "@/types/chat";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageList } from "@/components/chat/MessageList";
import { MessageActionsBar } from "@/components/chat/MessageActionsBar";
import { FeedbackButtons } from "@/components/chat/FeedbackButtons";
import { FeedbackPopover } from "@/components/chat/FeedbackPopover";
import { SourceCitation } from "@/components/chat/SourceCitation";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-1",
    role: "assistant",
    content: "안녕하세요.",
    status: "done",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

const sampleCitation: Citation = {
  sourceTitle: "MFE TF",
  sourceUrl: "https://www.notion.so/mfe-tf",
};

describe("MessageBubble", () => {
  it("user 메시지는 우측 정렬 클래스를 가진다", () => {
    const m = makeMessage({ role: "user", content: "안녕" });
    const { container } = render(<MessageBubble message={m} />);
    const bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble!.getAttribute("data-role")).toBe("user");
    expect(bubble!.className).toMatch(/ml-auto/);
  });

  it("assistant 메시지는 마크다운을 렌더하고 prose-invert 클래스를 가진다", () => {
    const m = makeMessage({ role: "assistant", content: "**bold** text" });
    const { container } = render(<MessageBubble message={m} />);
    const bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble!.className).toMatch(/prose-invert/);
    expect(bubble!.querySelector("strong")).not.toBeNull();
    expect(bubble!.querySelector("strong")?.textContent).toBe("bold");
  });

  it("status='typing' 시 TypingDots 만 표시되고 본문 텍스트는 없다", () => {
    const m = makeMessage({ status: "typing", content: "" });
    const { container } = render(<MessageBubble message={m} />);
    const status = within(container as HTMLElement).getByRole("status");
    expect(status).toBeInTheDocument();
    const dots = container.querySelectorAll('[data-slot="typing-dot"]');
    expect(dots.length).toBe(3);
    const body = container.querySelector('[data-slot="message-body"]');
    expect(body?.textContent ?? "").toBe("");
  });

  it("status='streaming' 시 본문과 cursor blink 가 함께 표시된다", () => {
    const m = makeMessage({ status: "streaming", content: "타이핑 중" });
    const { container } = render(<MessageBubble message={m} />);
    expect(container.textContent).toMatch(/타이핑 중/);
    const cursor = container.querySelector('[data-slot="streaming-cursor"]');
    expect(cursor).not.toBeNull();
    expect(cursor!.className).toMatch(/animate-pulse/);
  });

  it("citations 가 있으면 footer 에 SourceCitation chips 가 표시된다", () => {
    const m = makeMessage({
      content: "본문",
      citations: [sampleCitation, { sourceTitle: "두 번째", sourceUrl: null }],
    });
    const { container } = render(<MessageBubble message={m} />);
    const chips = container.querySelectorAll('[data-slot="source-citation"]');
    expect(chips.length).toBe(2);
    expect(chips[0]?.textContent).toContain("MFE TF");
  });

  it("외부 링크는 target=_blank rel='noopener noreferrer' 를 가진다", () => {
    const m = makeMessage({
      content: "[notion](https://www.notion.so/page)",
    });
    const { container } = render(<MessageBubble message={m} />);
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toMatch(/noopener/);
    expect(link!.getAttribute("rel")).toMatch(/noreferrer/);
  });
});

describe("MessageList", () => {
  it("role='log' aria-live='polite' 를 가진다", () => {
    render(<MessageList messages={[]} emptyState={<div>empty</div>} />);
    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
  });

  it("메시지가 0개이고 emptyState 가 있으면 emptyState 가 렌더된다", () => {
    render(<MessageList messages={[]} emptyState={<div data-testid="empty">없음</div>} />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });

  it("각 메시지가 MessageBubble 로 렌더되고 key 가 id 로 적용된다", () => {
    const messages: ChatMessage[] = [
      makeMessage({ id: "a", content: "첫 번째" }),
      makeMessage({ id: "b", role: "user", content: "두 번째" }),
    ];
    const { container } = render(<MessageList messages={messages} />);
    const bubbles = container.querySelectorAll('[data-slot="message-bubble"]');
    expect(bubbles.length).toBe(2);
    expect(bubbles[0]?.getAttribute("data-message-id")).toBe("a");
    expect(bubbles[1]?.getAttribute("data-message-id")).toBe("b");
  });
});

describe("MessageActionsBar", () => {
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useRealTimers();
    originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(window.navigator, "clipboard", originalClipboard);
    } else {
      delete (window.navigator as { clipboard?: unknown }).clipboard;
    }
    vi.restoreAllMocks();
  });

  // userEvent.setup() injects its own navigator.clipboard, so we override it
  // AFTER setup to ensure our mock wins.
  function setClipboard(writeText: ReturnType<typeof vi.fn>) {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText },
    });
  }

  it("Copy 버튼 클릭 시 onCopy 콜백이 호출된다", async () => {
    const onCopy = vi.fn();
    const user = userEvent.setup();
    setClipboard(vi.fn().mockResolvedValue(undefined));
    render(
      <MessageActionsBar
        messageId="m-1"
        text="복사 대상"
        citations={[]}
        onCopy={onCopy}
        onOpenSource={() => {}}
        onFeedback={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /복사/ }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("Copy 버튼 클릭 시 navigator.clipboard.writeText 가 호출된다", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <MessageActionsBar
        messageId="m-1"
        text="text-payload"
        citations={[]}
        onCopy={() => {}}
        onOpenSource={() => {}}
        onFeedback={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /복사/ }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("text-payload");
    });
  });

  it("clipboard.writeText 실패 시 execCommand 폴백을 시도한다", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard(writeText);
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: exec,
    });
    render(
      <MessageActionsBar
        messageId="m-1"
        text="payload"
        citations={[]}
        onCopy={() => {}}
        onOpenSource={() => {}}
        onFeedback={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /복사/ }));
    await waitFor(() => {
      expect(exec).toHaveBeenCalledWith("copy");
    });
  });
});

describe("FeedbackButtons + FeedbackPopover", () => {
  it("alreadySent=true 이면 두 버튼이 모두 disabled 된다", () => {
    render(
      <FeedbackButtons messageId="m-1" alreadySent={true} onUp={() => {}} onDownStart={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /도움이 됐어요/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /도움이 안 됐어요/ })).toBeDisabled();
  });

  it("👎 버튼 클릭 시 onDownStart 가 호출된다", async () => {
    const onDownStart = vi.fn();
    const user = userEvent.setup();
    render(
      <FeedbackButtons
        messageId="m-1"
        alreadySent={false}
        onUp={() => {}}
        onDownStart={onDownStart}
      />,
    );
    await user.click(screen.getByRole("button", { name: /도움이 안 됐어요/ }));
    expect(onDownStart).toHaveBeenCalledTimes(1);
  });

  it("popover 에서 reason='other' 선택 시 textarea 가 노출된다", async () => {
    const user = userEvent.setup();
    render(
      <FeedbackPopover
        open={true}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        trigger={<button>open</button>}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /기타/ }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("popover 제출 시 onSubmit(reason, detail) 호출 + popover close", async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FeedbackPopover
        open={true}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        trigger={<button>open</button>}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /관련 내용이 부족해요/ }));
    await user.click(screen.getByRole("button", { name: /제출/ }));
    expect(onSubmit).toHaveBeenCalledWith("incomplete", undefined);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("SourceCitation", () => {
  it("sourceUrl=null 이면 disabled + title='비공개' 가 적용된다", () => {
    const onClick = vi.fn();
    render(
      <SourceCitation
        citation={{ sourceTitle: "비공개 페이지", sourceUrl: null }}
        index={1}
        onClick={onClick}
      />,
    );
    const chip = screen.getByRole("button");
    expect(chip).toBeDisabled();
    expect(chip.getAttribute("title")).toMatch(/비공개/);
  });

  const NOTION_URL = "https://www.notion.so/fixture-page-1";

  function withPatchedLocation(fn: (assignSpy: ReturnType<typeof vi.fn>) => Promise<void>) {
    const assignSpy = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      value: { ...original, assign: assignSpy },
      writable: true,
    });
    return fn(assignSpy).finally(() => {
      Object.defineProperty(window, "location", { value: original, writable: true });
    });
  }

  it("웹뷰 등 새 탭 차단 환경 — window.open 이 null 이면 같은 탭 이동 폴백", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    await withPatchedLocation(async (assignSpy) => {
      render(
        <SourceCitation
          citation={{ sourceTitle: "MFE", sourceUrl: NOTION_URL }}
          index={1}
          onClick={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("link", { name: "1. MFE" }));
      // noopener 를 features 로 주면 성공해도 null 이 와서 이중 이동이 난다 — 2번째 인자까지만
      expect(openSpy).toHaveBeenCalledWith(NOTION_URL, "_blank");
      expect(assignSpy).toHaveBeenCalledWith(NOTION_URL);
    });
    openSpy.mockRestore();
  });

  it("새 탭이 정상으로 열리면(open 이 window 반환) 같은 탭 이동은 없다 — 이중 이동 회귀 방지", async () => {
    const user = userEvent.setup();
    const fakeWin = { opener: {} } as unknown as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeWin);
    await withPatchedLocation(async (assignSpy) => {
      render(
        <SourceCitation
          citation={{ sourceTitle: "MFE", sourceUrl: NOTION_URL }}
          index={1}
          onClick={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("link", { name: "1. MFE" }));
      expect(assignSpy).not.toHaveBeenCalled();
      expect(fakeWin.opener).toBeNull();
    });
    openSpy.mockRestore();
  });

  it("sourceUrl 정상이면 내부 경로 링크(<a>) 로 렌더된다", () => {
    const citation = { sourceTitle: "MFE", sourceUrl: "https://www.notion.so/fixture-page-1" };
    render(<SourceCitation citation={citation} index={1} onClick={vi.fn()} />);
    const link = screen.getByRole("link", { name: "1. MFE" });
    expect(link).toHaveAttribute("href", "https://www.notion.so/fixture-page-1");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
