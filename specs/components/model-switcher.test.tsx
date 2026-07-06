import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ModelSwitcher, type ModelId } from "@/components/chat/ModelSwitcher";

describe("ModelSwitcher", () => {
  it("disables the trigger when no models are available", () => {
    render(<ModelSwitcher value="gpt-4o-mini" available={[]} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("shows the currently selected model label", () => {
    render(
      <ModelSwitcher
        value="claude-3-5-haiku"
        available={["gpt-4o-mini", "claude-3-5-haiku"]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Claude 3.5 Haiku");
  });

  it("uses an aria-label of '답변 모델 선택'", () => {
    render(<ModelSwitcher value="gpt-4o-mini" available={["gpt-4o-mini"]} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-label", "답변 모델 선택");
  });

  it("does not call onChange just from rendering with a value", () => {
    const onChange = vi.fn();
    render(
      <ModelSwitcher
        value="gpt-4o-mini"
        available={["gpt-4o-mini", "claude-3-5-haiku"]}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts all three known model ids in the type", () => {
    const ids: ModelId[] = ["gpt-4o-mini", "claude-3-5-haiku", "gemini-2.0-flash"];
    expect(ids).toHaveLength(3);
  });

  describe("inline pill style + compact (TS-73, FEAT-030)", () => {
    it("Trigger 가 rounded-full + h-8 + bg-transparent (인라인 pill)", () => {
      render(<ModelSwitcher value="gpt-4o-mini" available={["gpt-4o-mini"]} onChange={() => {}} />);
      const trigger = screen.getByRole("combobox");
      const cls = trigger.className;
      expect(cls).toMatch(/rounded-full/);
      expect(cls).toMatch(/\bh-8\b/);
      expect(cls).toMatch(/bg-transparent/);
    });

    it("compact=true → 짧은 라벨 (예: 'GPT-4o')", () => {
      render(
        <ModelSwitcher
          value="gpt-4o-mini"
          available={["gpt-4o-mini"]}
          compact
          onChange={() => {}}
        />,
      );
      // short label "GPT-4o" — 'mini' suffix 가 표시되지 않아야 함
      expect(screen.getByRole("combobox")).toHaveTextContent(/^GPT-4o$/);
    });

    it("compact=false → 풀 라벨 (예: 'GPT-4o mini')", () => {
      render(<ModelSwitcher value="gpt-4o-mini" available={["gpt-4o-mini"]} onChange={() => {}} />);
      expect(screen.getByRole("combobox")).toHaveTextContent("GPT-4o mini");
    });

    it("compact 라벨 매핑: Haiku / Gemini 단축", () => {
      const { rerender } = render(
        <ModelSwitcher
          value="claude-3-5-haiku"
          available={["claude-3-5-haiku"]}
          compact
          onChange={() => {}}
        />,
      );
      expect(screen.getByRole("combobox")).toHaveTextContent("Haiku");
      rerender(
        <ModelSwitcher
          value="gemini-2.0-flash"
          available={["gemini-2.0-flash"]}
          compact
          onChange={() => {}}
        />,
      );
      expect(screen.getByRole("combobox")).toHaveTextContent("Gemini");
    });
  });
});
