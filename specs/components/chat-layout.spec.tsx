import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { ChatRoot } from "@/components/chat/ChatRoot";

const GREETING = {
  message: "안녕하세요",
  typingDelayMs: 0,
  wordIntervalMs: [10, 10] as [number, number],
  rememberDays: 30,
};

describe("ChatRoot layout (TS-71)", () => {
  it("renders children in order: header → scroll-area → JumpToLatest wrapper → SuggestionCarousel wrapper → Composer form", () => {
    const { container } = render(
      <ChatRoot
        greeting={GREETING}
        suggestions={[
          {
            id: "Q-001",
            category: "intro",
            text: "어떤 개발자예요?",
            expectedSourceTitles: [],
          },
        ]}
        availableModels={["nova-lite"]}
        defaultModelId={"nova-lite"}
      />,
    );
    const root = container.querySelector('[data-slot="chat-root"]') as HTMLElement;
    expect(root).not.toBeNull();
    const children = Array.from(root.children) as HTMLElement[];

    // 0: header
    expect(children[0]?.tagName).toBe("HEADER");
    // 1: scroll-area (MessageList container, flex-1 + overflow-y-auto)
    expect(children[1]?.getAttribute("data-slot")).toBe("chat-scroll");
    expect(children[1]?.className).toMatch(/flex-1/);
    expect(children[1]?.className).toMatch(/overflow-y-auto/);
    // 2: JumpToLatest wrapper (relative)
    expect(children[2]?.className).toMatch(/relative/);
    // 3: SuggestionCarousel wrapper — border-t (이제 위쪽 경계)
    expect(children[3]?.getAttribute("data-slot")).toBe("suggestion-wrapper");
    expect(children[3]?.className).toMatch(/border-t/);
    expect(children[3]?.className).not.toMatch(/\bborder-b\b/);
    // 4: Composer form
    expect(children[4]?.tagName).toBe("FORM");
    expect(children[4]?.getAttribute("data-slot")).toBe("composer");
  });

  it("Header 안에 ModelSwitcher 가 없다 (TS-73 integration)", () => {
    const { container } = render(
      <ChatRoot
        greeting={GREETING}
        suggestions={[]}
        availableModels={["nova-lite"]}
        defaultModelId={"nova-lite"}
      />,
    );
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.querySelector('[aria-label="답변 모델 선택"]')).toBeNull();
  });

  it("Composer 안에 ModelSwitcher 가 있다 (TS-73 integration)", () => {
    const { container } = render(
      <ChatRoot
        greeting={GREETING}
        suggestions={[]}
        availableModels={["nova-lite"]}
        defaultModelId={"nova-lite"}
      />,
    );
    const form = container.querySelector('form[data-slot="composer"]');
    expect(form).not.toBeNull();
    expect(form?.querySelector('[aria-label="답변 모델 선택"]')).not.toBeNull();
  });
});
