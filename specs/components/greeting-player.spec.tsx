import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GreetingPlayer, type GreetingConfig } from "@/components/chat/GreetingPlayer";
import type { ChatMessage } from "@/types/chat";
import {
  isGreetedRecent,
  readGreetedAt,
  writeGreetedAt,
  __resetGreetingFallback,
} from "@/lib/greeting";

const STORAGE_KEY = "portfolio.greeted";
const DAY_MS = 24 * 60 * 60 * 1000;

const baseConfig: GreetingConfig = {
  message: "안녕하세요 김윤수입니다.",
  typingDelayMs: 600,
  wordIntervalMs: [30, 50],
  rememberDays: 30,
};

function mockMatchMedia(match: (q: string) => boolean): void {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: match(q),
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

let originalLocalStorageDescriptor: PropertyDescriptor | undefined;

describe("GreetingPlayer", () => {
  beforeEach(() => {
    originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    if (typeof window.localStorage?.clear === "function") {
      try {
        window.localStorage.clear();
      } catch {
        // ignore
      }
    }
    __resetGreetingFallback();
    mockMatchMedia(() => false);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-05-07T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
    }
    __resetGreetingFallback();
  });

  it("config.message 빈 문자열 → null 렌더 + onComplete 미호출", () => {
    const onComplete = vi.fn();
    const { container } = render(
      <GreetingPlayer config={{ ...baseConfig, message: "   " }} onComplete={onComplete} />,
    );
    expect(container.querySelector('[data-slot="message-bubble"]')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("isGreetedRecent=true (storage 30일 내) → 즉시 done + onComplete", () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now() - 1000));
    const onComplete = vi.fn();
    const onRequestComposerFocus = vi.fn();
    const { container } = render(
      <GreetingPlayer
        config={baseConfig}
        onComplete={onComplete}
        onRequestComposerFocus={onRequestComposerFocus}
      />,
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    const bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble!.getAttribute("data-status")).toBe("done");
    expect(onRequestComposerFocus).toHaveBeenCalled();
  });

  it("prefers-reduced-motion → 즉시 done + 정적 표시", () => {
    mockMatchMedia((q) => q === "(prefers-reduced-motion: reduce)");
    const onComplete = vi.fn();
    const { container } = render(<GreetingPlayer config={baseConfig} onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble!.getAttribute("data-status")).toBe("done");
    expect(bubble!.textContent).toContain("안녕하세요");
  });

  it("정상 시퀀스: T+0 null → T+400 dots → T+1000 streaming 시작 → 단어 누적 → done", async () => {
    const onComplete = vi.fn();
    const onCarouselPulse = vi.fn();
    const { container } = render(
      <GreetingPlayer
        config={baseConfig}
        onComplete={onComplete}
        onCarouselPulse={onCarouselPulse}
      />,
    );

    // T+0: nothing rendered (init phase)
    expect(container.querySelector('[data-slot="message-bubble"]')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();

    // T+400: dots phase
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    let bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble!.getAttribute("data-status")).toBe("typing");
    expect(onComplete).not.toHaveBeenCalled();

    // T+1000: streaming begins
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble!.getAttribute("data-status")).toBe("streaming");
    expect(onComplete).not.toHaveBeenCalled();

    // Advance until done
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble!.getAttribute("data-status")).toBe("done");
    expect(bubble!.textContent).toContain("안녕하세요");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCarouselPulse).toHaveBeenCalledTimes(1);
  });

  it("fastForwardSignal 변경 → 즉시 done + storage 기록", () => {
    const onComplete = vi.fn();
    const { rerender, container } = render(
      <GreetingPlayer config={baseConfig} onComplete={onComplete} fastForwardSignal={0} />,
    );

    // Mid-simulation: still in dots/streaming
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onComplete).not.toHaveBeenCalled();

    // Trigger fast-forward
    rerender(<GreetingPlayer config={baseConfig} onComplete={onComplete} fastForwardSignal={1} />);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const bubble = container.querySelector('[data-slot="message-bubble"]');
    expect(bubble!.getAttribute("data-status")).toBe("done");
    expect(bubble!.textContent).toContain("안녕하세요");
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("storage 차단 환경 (localStorage throw) → 메모리 fallback 동작", async () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
    Object.defineProperty(window, "localStorage", {
      value: blocked,
      writable: true,
      configurable: true,
    });

    const onComplete = vi.fn();
    render(<GreetingPlayer config={baseConfig} onComplete={onComplete} />);

    // Simulation should run (no skip), no crash
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("onComplete 의 message: id 자동 생성, role='greeting', status='done', content 일치", async () => {
    const onComplete = vi.fn();
    render(<GreetingPlayer config={baseConfig} onComplete={onComplete} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const args = onComplete.mock.calls[0];
    expect(args).toBeDefined();
    const msg = args![0] as ChatMessage;
    expect(typeof msg.id).toBe("string");
    expect(msg.id.length).toBeGreaterThan(0);
    expect(msg.role).toBe("greeting");
    expect(msg.status).toBe("done");
    expect(msg.content).toBe(baseConfig.message);
    expect(typeof msg.createdAt).toBe("number");
  });

  it("rememberDays 만료 (storage > rememberDays 일 전) → 시뮬레이션 다시", async () => {
    const past = Date.now() - 31 * DAY_MS;
    localStorage.setItem(STORAGE_KEY, String(past));

    const onComplete = vi.fn();
    const { container } = render(<GreetingPlayer config={baseConfig} onComplete={onComplete} />);

    // Should NOT immediately complete (must run simulation)
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="message-bubble"]')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("lib/greeting", () => {
  let original: PropertyDescriptor | undefined;
  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(window, "localStorage");
    if (typeof window.localStorage?.clear === "function") {
      try {
        window.localStorage.clear();
      } catch {
        // ignore
      }
    }
    __resetGreetingFallback();
  });
  afterEach(() => {
    if (original) Object.defineProperty(window, "localStorage", original);
    __resetGreetingFallback();
  });

  it("isGreetedRecent: storage 없음 → false", () => {
    expect(isGreetedRecent(30)).toBe(false);
  });

  it("isGreetedRecent: 1일 전 + rememberDays=30 → true", () => {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now - 1 * DAY_MS));
    expect(isGreetedRecent(30, now)).toBe(true);
  });

  it("isGreetedRecent: 31일 전 + rememberDays=30 → false", () => {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now - 31 * DAY_MS));
    expect(isGreetedRecent(30, now)).toBe(false);
  });

  it("readGreetedAt: 정상 storage → 파싱된 timestamp 반환", () => {
    localStorage.setItem(STORAGE_KEY, "1700000000000");
    expect(readGreetedAt()).toBe(1700000000000);
  });

  it("storage 차단 시 readGreetedAt → null fallback", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null,
      },
      writable: true,
      configurable: true,
    });
    try {
      expect(readGreetedAt()).toBeNull();
      // writeGreetedAt should not throw
      expect(() => writeGreetedAt(Date.now())).not.toThrow();
      // After memory write, readGreetedAt returns the memory value
      const t = 1_234_567_890;
      writeGreetedAt(t);
      expect(readGreetedAt()).toBe(t);
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
