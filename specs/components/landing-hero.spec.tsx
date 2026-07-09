import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPush = vi.fn();
const mockPrefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, prefetch: mockPrefetch }),
}));

import { LandingHero } from "@/components/landing/LandingHero";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

const CHIPS: SuggestedQuestionMeta[] = [
  { id: "Q-001", category: "intro", text: "김윤수 어떤 개발자예요?", expectedSourceTitles: [] },
  { id: "Q-017", category: "stack", text: "자주 쓰는 기술 스택은요?", expectedSourceTitles: [] },
];

function setReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderHero() {
  return render(
    <LandingHero
      headline="안녕하세요, 프론트엔드 개발자 김윤수입니다."
      subline="궁금한 건 무엇이든 물어보세요."
      chips={CHIPS}
      imageUrl={null}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setReducedMotion(true); // 기본: reduced-motion → 즉시 전체 표시 (결정적 테스트)
});

describe("LandingHero (FEAT-034 / TS-81)", () => {
  it("reduced-motion → 인사말 즉시 전체 표시", () => {
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "안녕하세요, 프론트엔드 개발자 김윤수입니다.",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "궁금한 건 무엇이든 물어보세요.",
    );
  });

  it("타이핑 모드 → 처음엔 미표시, 시간이 지나면 단어 단위 표시", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    try {
      renderHero();
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).not.toHaveTextContent("김윤수입니다");
      act(() => {
        vi.advanceTimersByTime(5000); // 전체 타임라인 소진
      });
      expect(h1).toHaveTextContent("김윤수입니다");
    } finally {
      vi.useRealTimers();
    }
  });

  it("칩 클릭 → /chat?q=질문 으로 이동", async () => {
    const user = userEvent.setup();
    renderHero();
    await user.click(screen.getByRole("button", { name: "자주 쓰는 기술 스택은요?" }));
    expect(mockPush).toHaveBeenCalledWith(
      `/chat?q=${encodeURIComponent("자주 쓰는 기술 스택은요?")}`,
    );
  });

  it("채팅 인풋(placeholder '궁금한 것 물어보기') 클릭 → /chat 이동", async () => {
    const user = userEvent.setup();
    renderHero();
    const fakeInput = screen.getByRole("button", { name: /궁금한 것 물어보기/ });
    expect(fakeInput).toHaveTextContent("궁금한 것 물어보기");
    await user.click(fakeInput);
    expect(mockPush).toHaveBeenCalledWith("/chat");
  });
});
