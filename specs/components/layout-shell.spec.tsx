import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Briefcase } from "lucide-react";

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { Header } from "@/components/layout/Header";
import { SideSheet } from "@/components/layout/SideSheet";
import { SideMenuItem } from "@/components/layout/SideMenuItem";
import { Footer } from "@/components/layout/Footer";
import { LayoutClient } from "@/components/layout/LayoutClient";

beforeEach(() => {
  mockPathname = "/";
});

describe("Header", () => {
  it("renders brand link to '/'", () => {
    render(<Header onMenuOpen={() => {}} menuOpen={false} />);
    const brand = screen.getByRole("link", { name: /김윤수/ });
    expect(brand).toHaveAttribute("href", "/");
  });

  it("calls onMenuOpen when hamburger clicked", async () => {
    const onMenuOpen = vi.fn();
    const user = userEvent.setup();
    render(<Header onMenuOpen={onMenuOpen} menuOpen={false} />);
    await user.click(screen.getByRole("button", { name: /메뉴 열기/ }));
    expect(onMenuOpen).toHaveBeenCalledTimes(1);
  });

  it("toggles aria-expanded based on menuOpen prop", () => {
    const { rerender } = render(<Header onMenuOpen={() => {}} menuOpen={false} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    rerender(<Header onMenuOpen={() => {}} menuOpen={true} />);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles aria-label between '메뉴 열기' and '메뉴 닫기'", () => {
    const { rerender } = render(<Header onMenuOpen={() => {}} menuOpen={false} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "메뉴 열기");
    rerender(<Header onMenuOpen={() => {}} menuOpen={true} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "메뉴 닫기");
  });

  it("does not use backdrop-filter blur (AI slop guard)", () => {
    const { container } = render(<Header onMenuOpen={() => {}} menuOpen={false} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/backdrop-blur/);
    expect(html).not.toMatch(/backdrop-filter/);
  });
});

describe("SideMenuItem", () => {
  it("renders link with given href and label", () => {
    render(<SideMenuItem href="/about" label="자기소개" Icon={Briefcase} active={false} />);
    const link = screen.getByRole("link", { name: /자기소개/ });
    expect(link).toHaveAttribute("href", "/about");
  });

  it("marks active=true with data-active attribute", () => {
    render(<SideMenuItem href="/about" label="자기소개" Icon={Briefcase} active={true} />);
    expect(screen.getByRole("link")).toHaveAttribute("data-active", "true");
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <SideMenuItem
        href="/about"
        label="자기소개"
        Icon={Briefcase}
        active={false}
        onClick={onClick}
      />,
    );
    await user.click(screen.getByRole("link"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("SideSheet", () => {
  it("does not render menu items when open=false", () => {
    render(<SideSheet open={false} onOpenChange={() => {}} currentPath="/" />);
    expect(screen.queryByRole("link", { name: /자기소개/ })).toBeNull();
  });

  it("renders all 4 menu items when open=true", () => {
    render(<SideSheet open={true} onOpenChange={() => {}} currentPath="/" />);
    expect(screen.getByRole("link", { name: /^대화/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /자기소개/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /기술 이력/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /연락하기/ })).toBeInTheDocument();
  });

  it("ESC key calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<SideSheet open={true} onOpenChange={onOpenChange} currentPath="/" />);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking a menu item calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<SideSheet open={true} onOpenChange={onOpenChange} currentPath="/" />);
    await user.click(screen.getByRole("link", { name: /자기소개/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("currentPath highlights matching menu item via data-active=true", () => {
    render(<SideSheet open={true} onOpenChange={() => {}} currentPath="/about" />);
    const link = screen.getByRole("link", { name: /자기소개/ });
    expect(link).toHaveAttribute("data-active", "true");
    const home = screen.getByRole("link", { name: /^대화/ });
    expect(home).toHaveAttribute("data-active", "false");
  });

  it("renders socials when provided", () => {
    render(
      <SideSheet
        open={true}
        onOpenChange={() => {}}
        currentPath="/"
        socials={{ github: "https://github.com/YoonsooKim9", email: "mailto:bbabi0901@gmail.com" }}
      />,
    );
    expect(screen.getByRole("link", { name: /GitHub/i })).toHaveAttribute(
      "href",
      "https://github.com/YoonsooKim9",
    );
    expect(screen.getByRole("link", { name: /Email/i })).toHaveAttribute(
      "href",
      "mailto:bbabi0901@gmail.com",
    );
  });

  it("displays lastUpdated when provided", () => {
    render(
      <SideSheet
        open={true}
        onOpenChange={() => {}}
        currentPath="/"
        lastUpdated="2026-05-07"
      />,
    );
    expect(screen.getByText(/2026-05-07/)).toBeInTheDocument();
  });
});

describe("Footer", () => {
  it("renders '—' when lastUpdated is undefined", () => {
    render(<Footer />);
    expect(screen.getByText(/마지막 업데이트/)).toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });

  it("renders the lastUpdated date when provided", () => {
    render(<Footer lastUpdated="2026-05-07" />);
    expect(screen.getByText(/2026-05-07/)).toBeInTheDocument();
  });

  it("renders GitHub link when socials.github is provided", () => {
    render(<Footer socials={{ github: "https://github.com/YoonsooKim9" }} />);
    expect(screen.getByRole("link", { name: /GitHub/i })).toHaveAttribute(
      "href",
      "https://github.com/YoonsooKim9",
    );
  });

  it("renders Email link when socials.email is provided", () => {
    render(<Footer socials={{ email: "mailto:bbabi0901@gmail.com" }} />);
    expect(screen.getByRole("link", { name: /Email/i })).toHaveAttribute(
      "href",
      "mailto:bbabi0901@gmail.com",
    );
  });

  it("opens privacy popover with detailed text on click", async () => {
    const user = userEvent.setup();
    render(<Footer />);
    const trigger = screen.getByRole("button", { name: /privacy/i });
    await user.click(trigger);
    expect(
      await screen.findByText(/익명|학습 데이터|개인정보/),
    ).toBeInTheDocument();
  });
});

describe("LayoutClient", () => {
  it("hamburger click opens the SideSheet (links visible)", async () => {
    const user = userEvent.setup();
    render(
      <LayoutClient>
        <div>page</div>
      </LayoutClient>,
    );
    expect(screen.queryByRole("link", { name: /자기소개/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /메뉴 열기/ }));
    expect(screen.getByRole("link", { name: /자기소개/ })).toBeInTheDocument();
  });

  it("rapid hamburger clicks debounce within 80ms (final state settles open)", () => {
    render(
      <LayoutClient>
        <div>page</div>
      </LayoutClient>,
    );
    const btn = screen.getByRole("button", { name: /메뉴 열기/ });
    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    expect(screen.getByRole("link", { name: /자기소개/ })).toBeInTheDocument();
  });

  it("auto-closes when usePathname changes", async () => {
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
});
