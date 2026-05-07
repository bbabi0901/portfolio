import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { ScrollToTopOnRouteChange } from "@/components/layout/ScrollToTopOnRouteChange";
import { LayoutClient } from "@/components/layout/LayoutClient";

beforeEach(() => {
  mockPathname = "/";
  (window.scrollTo as ReturnType<typeof vi.fn>).mockClear?.();
});

describe("ScrollToTopOnRouteChange", () => {
  it("calls window.scrollTo({top:0, behavior:'instant'}) on mount", () => {
    render(<ScrollToTopOnRouteChange />);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });

  it("calls window.scrollTo again when pathname changes", () => {
    const { rerender } = render(<ScrollToTopOnRouteChange />);
    const calls = (window.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length;
    mockPathname = "/about";
    rerender(<ScrollToTopOnRouteChange />);
    expect(
      (window.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(calls);
  });
});

describe("LayoutClient routing cross-cutting", () => {
  it("SideSheet starts closed on direct page entry", () => {
    mockPathname = "/contact";
    render(
      <LayoutClient>
        <div>page</div>
      </LayoutClient>,
    );
    expect(screen.queryByRole("link", { name: /자기소개/ })).toBeNull();
  });

  it("auto-closes SideSheet when pathname changes after open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LayoutClient>
        <div>page</div>
      </LayoutClient>,
    );
    await user.click(screen.getByRole("button", { name: /메뉴 열기/ }));
    expect(screen.getByRole("link", { name: /자기소개/ })).toBeInTheDocument();
    mockPathname = "/about";
    rerender(
      <LayoutClient>
        <div>page</div>
      </LayoutClient>,
    );
    expect(screen.queryByRole("link", { name: /자기소개/ })).toBeNull();
  });

  it("invokes window.scrollTo on pathname change (mounts ScrollToTop)", () => {
    const { rerender } = render(
      <LayoutClient>
        <div>page</div>
      </LayoutClient>,
    );
    const before = (window.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length;
    mockPathname = "/experience";
    rerender(
      <LayoutClient>
        <div>page</div>
      </LayoutClient>,
    );
    expect(
      (window.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(before);
  });
});
