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
        value="claude-3-5-haiku-latest"
        available={["gpt-4o-mini", "claude-3-5-haiku-latest"]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Claude 3.5 Haiku");
  });

  it("uses an aria-label of '답변 모델 선택'", () => {
    render(
      <ModelSwitcher value="gpt-4o-mini" available={["gpt-4o-mini"]} onChange={() => {}} />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-label", "답변 모델 선택");
  });

  it("does not call onChange just from rendering with a value", () => {
    const onChange = vi.fn();
    render(
      <ModelSwitcher
        value="gpt-4o-mini"
        available={["gpt-4o-mini", "claude-3-5-haiku-latest"]}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts all three known model ids in the type", () => {
    const ids: ModelId[] = ["gpt-4o-mini", "claude-3-5-haiku-latest", "gemini-2.0-flash-exp"];
    expect(ids).toHaveLength(3);
  });
});
