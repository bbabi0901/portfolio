import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { ComponentProps } from "react";
import { Composer } from "@/components/chat/Composer";

function setup(overrides: Partial<ComponentProps<typeof Composer>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const utils = render(
    <Composer value="" onChange={onChange} onSubmit={onSubmit} {...overrides} />,
  );
  return { ...utils, onChange, onSubmit };
}

describe("Composer", () => {
  describe("Enter / Shift+Enter", () => {
    it("Enter → onSubmit(value) + onChange('')", () => {
      const { onChange, onSubmit } = setup({ value: "hi" });
      const ta = screen.getByRole("textbox");
      fireEvent.keyDown(ta, { key: "Enter" });
      expect(onSubmit).toHaveBeenCalledWith("hi");
      expect(onChange).toHaveBeenCalledWith("");
    });

    it("Shift+Enter → 줄바꿈, onSubmit 미호출", () => {
      const { onSubmit } = setup({ value: "hi" });
      const ta = screen.getByRole("textbox");
      fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("Enter 시 default action 이 preventDefault 된다", () => {
      const { onSubmit } = setup({ value: "hi" });
      const ta = screen.getByRole("textbox");
      const evt = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      ta.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe("IME 3중 체크", () => {
    it("compositionStart 후 Enter → onSubmit 미호출", () => {
      const { onSubmit } = setup({ value: "안녕" });
      const ta = screen.getByRole("textbox");
      fireEvent.compositionStart(ta);
      fireEvent.keyDown(ta, { key: "Enter" });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("nativeEvent.isComposing=true → onSubmit 미호출", () => {
      const { onSubmit } = setup({ value: "あ" });
      const ta = screen.getByRole("textbox");
      fireEvent.keyDown(ta, { key: "Enter", isComposing: true });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("keyCode=229 (legacy Android IME) → onSubmit 미호출", () => {
      const { onSubmit } = setup({ value: "한" });
      const ta = screen.getByRole("textbox");
      fireEvent.keyDown(ta, { key: "Enter", keyCode: 229 });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("compositionEnd 후 Enter → onSubmit 정상 호출", () => {
      const { onSubmit } = setup({ value: "안녕" });
      const ta = screen.getByRole("textbox");
      fireEvent.compositionStart(ta);
      fireEvent.compositionEnd(ta);
      fireEvent.keyDown(ta, { key: "Enter" });
      expect(onSubmit).toHaveBeenCalledWith("안녕");
    });
  });

  describe("submit gating", () => {
    it("trim 후 빈 문자열이면 Enter 로 onSubmit 미호출", () => {
      const { onSubmit } = setup({ value: "   " });
      const ta = screen.getByRole("textbox");
      fireEvent.keyDown(ta, { key: "Enter" });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("disabled=true 면 Enter 로 onSubmit 미호출", () => {
      const { onSubmit } = setup({ value: "hi", disabled: true });
      const ta = screen.getByRole("textbox");
      fireEvent.keyDown(ta, { key: "Enter" });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("disabled=true 라도 textarea 자체는 disabled 가 아니다 (keystroke 허용)", () => {
      setup({ value: "hi", disabled: true });
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(ta.disabled).toBe(false);
    });

    it("disabled=true 면 전송 버튼이 disabled", () => {
      setup({ value: "hi", disabled: true });
      expect(screen.getByRole("button", { name: /전송/ })).toBeDisabled();
    });

    it("trim 후 빈 문자열이면 전송 버튼이 disabled", () => {
      setup({ value: "   " });
      expect(screen.getByRole("button", { name: /전송/ })).toBeDisabled();
    });

    it("정상 값이면 전송 버튼 클릭 시 onSubmit 호출", async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup({ value: "hi" });
      await user.click(screen.getByRole("button", { name: /전송/ }));
      expect(onSubmit).toHaveBeenCalledWith("hi");
    });
  });

  describe("길이 카운터 및 maxLength cap", () => {
    it("remaining > 100 면 카운터 미표시", () => {
      const { container } = setup({ value: "a".repeat(399), maxLength: 500 });
      expect(container.querySelector('[data-slot="composer-counter"]')).toBeNull();
    });

    it("remaining <= 100 이면 카운터 표시 (값 = remaining)", () => {
      const { container } = setup({ value: "a".repeat(400), maxLength: 500 });
      const counter = container.querySelector('[data-slot="composer-counter"]');
      expect(counter).not.toBeNull();
      expect(counter!.textContent?.trim()).toBe("100");
    });

    it("remaining < 0 이면 카운터가 위험(danger) 색 클래스를 가진다", () => {
      const { container } = setup({ value: "a".repeat(510), maxLength: 500 });
      const counter = container.querySelector('[data-slot="composer-counter"]');
      expect(counter).not.toBeNull();
      expect(counter!.className).toMatch(/text-danger/);
    });

    it("change 가 maxLength 초과하면 onChange 가 잘린 값으로 호출된다", () => {
      const { onChange } = setup({ value: "", maxLength: 10 });
      const ta = screen.getByRole("textbox");
      fireEvent.change(ta, { target: { value: "12345678901234567890" } });
      expect(onChange).toHaveBeenCalledWith("1234567890");
    });

    it("change 가 maxLength 이하면 그대로 onChange 호출", () => {
      const { onChange } = setup({ value: "", maxLength: 10 });
      const ta = screen.getByRole("textbox");
      fireEvent.change(ta, { target: { value: "hello" } });
      expect(onChange).toHaveBeenCalledWith("hello");
    });
  });

  describe("자동 높이 / safe area / placeholder", () => {
    it("scrollHeight 변경 → textarea.style.height 가 갱신된다", () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const { rerender } = render(<Composer value="" onChange={onChange} onSubmit={onSubmit} />);
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      Object.defineProperty(ta, "scrollHeight", {
        configurable: true,
        value: 80,
      });
      rerender(<Composer value="hi" onChange={onChange} onSubmit={onSubmit} />);
      expect(ta.style.height).toBe("80px");
    });

    it("safe-area-inset-bottom 패딩이 form 컨테이너에 적용된다", () => {
      const { container } = setup();
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      expect(form!.className).toMatch(/safe-area-inset-bottom/);
    });

    it("placeholder 기본값은 FEAT-030 의 prominent 문구", () => {
      setup();
      expect(screen.getByPlaceholderText(/김윤수에게 직접 물어보세요/)).toBeInTheDocument();
    });

    it("placeholder prop 으로 override 가능", () => {
      setup({ placeholder: "무엇이든 물어보세요" });
      expect(screen.getByPlaceholderText("무엇이든 물어보세요")).toBeInTheDocument();
    });
  });

  describe("Composer prominent box (TS-72, FEAT-030)", () => {
    it("외곽 form 에 rounded-3xl + border-line-strong + bg-elevated/40", () => {
      const { container } = setup();
      const form = container.querySelector('form[data-slot="composer"]');
      expect(form).not.toBeNull();
      const cls = form?.className ?? "";
      expect(cls).toMatch(/rounded-3xl/);
      expect(cls).toMatch(/border-line-strong/);
      expect(cls).toMatch(/bg-elevated\/40/);
    });

    it("focus-within 시 border-line-strong + bg-elevated/60", () => {
      const { container } = setup();
      const cls = container.querySelector("form")?.className ?? "";
      expect(cls).toMatch(/focus-within:border-line-strong/);
      expect(cls).toMatch(/focus-within:bg-elevated\/60/);
    });

    it("Send 버튼: aria-label '메시지 전송' + rounded-full + size-8 md:size-9", () => {
      const { container } = setup({ value: "hi" });
      const send = container.querySelector('button[aria-label="메시지 전송"]');
      expect(send).not.toBeNull();
      const cls = send?.className ?? "";
      expect(cls).toMatch(/rounded-full/);
      expect(cls).toMatch(/size-8/);
      expect(cls).toMatch(/md:size-9/);
    });

    it("leftAction children 렌더 (ModelSwitcher slot)", () => {
      const { getByTestId } = setup({
        leftAction: <div data-testid="left-slot">model</div>,
      });
      expect(getByTestId("left-slot")).toBeInTheDocument();
    });

    it("액션 row 가 textarea 직하단에 있고 정렬: justify-between gap-2", () => {
      const { container } = setup();
      const actions = container.querySelector('[data-slot="composer-actions"]');
      expect(actions).not.toBeNull();
      expect(actions?.className).toMatch(/justify-between/);
      expect(actions?.className).toMatch(/gap-2/);
    });
  });
});
