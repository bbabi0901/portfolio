import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { JumpToLatestButton } from "@/components/chat/JumpToLatestButton";

describe("JumpToLatestButton", () => {
  it("renders nothing when visible is false", () => {
    const { container } = render(<JumpToLatestButton visible={false} onClick={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a button when visible is true", () => {
    render(<JumpToLatestButton visible={true} onClick={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<JumpToLatestButton visible={true} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses the aria-label '가장 최신 메시지로 이동'", () => {
    render(<JumpToLatestButton visible={true} onClick={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "가장 최신 메시지로 이동");
  });

  it("renders the visible label text '최신으로'", () => {
    render(<JumpToLatestButton visible={true} onClick={() => {}} />);
    expect(screen.getByText("최신으로")).toBeInTheDocument();
  });

  it("merges a custom className on the button", () => {
    render(<JumpToLatestButton visible={true} onClick={() => {}} className="ring-1" />);
    expect(screen.getByRole("button").className).toMatch(/ring-1/);
  });
});
