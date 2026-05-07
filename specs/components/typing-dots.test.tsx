import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TypingDots } from "@/components/chat/TypingDots";

describe("TypingDots", () => {
  it('exposes role="status" with aria-live="polite"', () => {
    render(<TypingDots />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("uses '응답 생성 중' as the default aria-label", () => {
    render(<TypingDots />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "응답 생성 중");
  });

  it("accepts a custom ariaLabel prop", () => {
    render(<TypingDots ariaLabel="thinking" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "thinking");
  });

  it("renders three dot children", () => {
    const { container } = render(<TypingDots />);
    const dots = container.querySelectorAll('[data-slot="typing-dot"]');
    expect(dots.length).toBe(3);
  });

  it("each dot uses the typing-dot animation with staggered delays", () => {
    const { container } = render(<TypingDots />);
    const dots = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="typing-dot"]'),
    );
    expect(dots).toHaveLength(3);
    const [d0, d1, d2] = dots as [HTMLElement, HTMLElement, HTMLElement];
    expect(d0.style.animationDelay).toBe("0ms");
    expect(d1.style.animationDelay).toBe("150ms");
    expect(d2.style.animationDelay).toBe("300ms");
    for (const d of dots) {
      expect(d.className).toMatch(/animate-\[typing-dot/);
      expect(d.className).toMatch(/motion-reduce:animate-none/);
    }
  });

  it("merges a custom className on the wrapper", () => {
    render(<TypingDots className="custom-x" />);
    expect(screen.getByRole("status").className).toMatch(/custom-x/);
  });
});
