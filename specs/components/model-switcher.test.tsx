import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ModelSwitcher, type ModelId } from "@/components/chat/ModelSwitcher";

describe("ModelSwitcher", () => {
  it("disables the trigger when no models are available", () => {
    render(<ModelSwitcher value="nova-lite" available={[]} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("shows the currently selected model label", () => {
    render(
      <ModelSwitcher
        value="claude-haiku"
        available={["nova-lite", "claude-haiku"]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Claude Haiku");
  });

  it("uses an aria-label of '답변 모델 선택'", () => {
    render(<ModelSwitcher value="nova-lite" available={["nova-lite"]} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-label", "답변 모델 선택");
  });

  it("does not call onChange just from rendering with a value", () => {
    const onChange = vi.fn();
    render(
      <ModelSwitcher
        value="nova-lite"
        available={["nova-lite", "claude-haiku"]}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts all three known model ids in the type", () => {
    const ids: ModelId[] = ["nova-lite", "claude-haiku", "nova-micro"];
    expect(ids).toHaveLength(3);
  });

  describe("inline pill style + compact (TS-73, FEAT-030)", () => {
    it("Trigger 가 rounded-full + h-8 + bg-transparent (인라인 pill)", () => {
      render(<ModelSwitcher value="nova-lite" available={["nova-lite"]} onChange={() => {}} />);
      const trigger = screen.getByRole("combobox");
      const cls = trigger.className;
      expect(cls).toMatch(/rounded-full/);
      expect(cls).toMatch(/\bh-8\b/);
      expect(cls).toMatch(/bg-transparent/);
    });

    it("compact=true → 짧은 라벨 (예: 'Nova Lite')", () => {
      render(
        <ModelSwitcher value="nova-lite" available={["nova-lite"]} compact onChange={() => {}} />,
      );
      // short label "Nova Lite" — 'mini' suffix 가 표시되지 않아야 함
      expect(screen.getByRole("combobox")).toHaveTextContent(/^Nova Lite$/);
    });

    it("compact=false → 풀 라벨 (예: 'Amazon Nova Lite')", () => {
      render(<ModelSwitcher value="nova-lite" available={["nova-lite"]} onChange={() => {}} />);
      expect(screen.getByRole("combobox")).toHaveTextContent("Amazon Nova Lite");
    });

    it("compact 라벨 매핑: Haiku / Nova Micro 단축", () => {
      const { rerender } = render(
        <ModelSwitcher
          value="claude-haiku"
          available={["claude-haiku"]}
          compact
          onChange={() => {}}
        />,
      );
      expect(screen.getByRole("combobox")).toHaveTextContent("Haiku");
      rerender(
        <ModelSwitcher value="nova-micro" available={["nova-micro"]} compact onChange={() => {}} />,
      );
      expect(screen.getByRole("combobox")).toHaveTextContent("Nova Micro");
    });
  });
});
