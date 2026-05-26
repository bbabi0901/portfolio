import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SuggestionCarousel } from "@/components/chat/SuggestionCarousel";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

const sample: SuggestedQuestionMeta[] = [
  { id: "Q-001", category: "intro", text: "어떤 개발자예요?", expectedSourceTitles: [] },
  { id: "Q-002", category: "project", text: "MFE 어떻게 했어요?", expectedSourceTitles: [] },
  { id: "Q-003", category: "tech", text: "Turbopack 결과는요?", expectedSourceTitles: [] },
];

describe("SuggestionCarousel", () => {
  it("renders nothing when questions is empty", () => {
    const { container } = render(
      <SuggestionCarousel questions={[]} visitedIds={new Set()} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders each question text", () => {
    render(<SuggestionCarousel questions={sample} visitedIds={new Set()} onSelect={() => {}} />);
    expect(screen.getByText("어떤 개발자예요?")).toBeInTheDocument();
    expect(screen.getByText("MFE 어떻게 했어요?")).toBeInTheDocument();
    expect(screen.getByText("Turbopack 결과는요?")).toBeInTheDocument();
  });

  it("invokes onSelect with the question when a badge is clicked", () => {
    const onSelect = vi.fn();
    render(<SuggestionCarousel questions={sample} visitedIds={new Set()} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("MFE 어떻게 했어요?"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(sample[1]);
  });

  it("marks visited badges with data-visited and faded styling", () => {
    render(
      <SuggestionCarousel questions={sample} visitedIds={new Set(["Q-002"])} onSelect={() => {}} />,
    );
    const visited = screen.getByText("MFE 어떻게 했어요?").closest("button");
    const fresh = screen.getByText("어떤 개발자예요?").closest("button");
    expect(visited).toHaveAttribute("data-visited", "true");
    expect(fresh).toHaveAttribute("data-visited", "false");
    expect(visited?.className).toMatch(/opacity-60|opacity-50/);
  });

  it("disables autoplay (no auto-rotation behavior)", () => {
    const { container } = render(
      <SuggestionCarousel questions={sample} visitedIds={new Set()} onSelect={() => {}} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
  });
});
