import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ContactSchema } from "@/lib/contact-schema";
import { ContactForm } from "@/components/contact/ContactForm";
import { DirectContactCard } from "@/components/contact/DirectContactCard";

describe("ContactSchema", () => {
  it("emptyValidation: 이름 빈 문자열 → 실패", () => {
    const r = ContactSchema.safeParse({
      name: "",
      email: "a@b.com",
      message: "0123456789",
      website: "",
    });
    expect(r.success).toBe(false);
  });

  it("nameLength: 이름 41자 → 실패", () => {
    const r = ContactSchema.safeParse({
      name: "a".repeat(41),
      email: "a@b.com",
      message: "0123456789",
      website: "",
    });
    expect(r.success).toBe(false);
  });

  it("nameKorean: '김 윤수' (한국어 + 공백) → 통과", () => {
    const r = ContactSchema.safeParse({
      name: "김 윤수",
      email: "a@b.com",
      message: "0123456789",
      website: "",
    });
    expect(r.success).toBe(true);
  });

  it("emailFormat: 이메일 'abc' → 실패", () => {
    const r = ContactSchema.safeParse({
      name: "김윤수",
      email: "abc",
      message: "0123456789",
      website: "",
    });
    expect(r.success).toBe(false);
  });

  it("emailAlias: me+a@gmail.com → 통과", () => {
    const r = ContactSchema.safeParse({
      name: "김윤수",
      email: "me+a@gmail.com",
      message: "0123456789",
      website: "",
    });
    expect(r.success).toBe(true);
  });

  it("emailKorean: 한국어 입력 '안녕' → 실패", () => {
    const r = ContactSchema.safeParse({
      name: "김윤수",
      email: "안녕",
      message: "0123456789",
      website: "",
    });
    expect(r.success).toBe(false);
  });

  it("messageLength: 9자 → 실패", () => {
    const r = ContactSchema.safeParse({
      name: "김윤수",
      email: "a@b.com",
      message: "012345678",
      website: "",
    });
    expect(r.success).toBe(false);
  });

  it("messageLength: 2001자 → 실패", () => {
    const r = ContactSchema.safeParse({
      name: "김윤수",
      email: "a@b.com",
      message: "x".repeat(2001),
      website: "",
    });
    expect(r.success).toBe(false);
  });

  it("honeypot website 채워짐 → 실패", () => {
    const r = ContactSchema.safeParse({
      name: "김윤수",
      email: "a@b.com",
      message: "0123456789",
      website: "spam",
    });
    expect(r.success).toBe(false);
  });

  it("honeypot website 비어 있음 → 통과", () => {
    const r = ContactSchema.safeParse({
      name: "김윤수",
      email: "a@b.com",
      message: "0123456789",
      website: "",
    });
    expect(r.success).toBe(true);
  });
});

function renderForm(overrides: Partial<React.ComponentProps<typeof ContactForm>> = {}) {
  const onSubmit = vi
    .fn<NonNullable<React.ComponentProps<typeof ContactForm>["onSubmit"]>>()
    .mockResolvedValue({ ok: true });
  const utils = render(<ContactForm onSubmit={onSubmit} {...overrides} />);
  return { ...utils, onSubmit };
}

async function fillValidFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/이름/i), "김윤수");
  await user.type(screen.getByLabelText(/이메일/i), "me@example.com");
  await user.type(screen.getByLabelText(/메시지/i), "협업 문의드려요. 답변 부탁드립니다.");
}

describe("ContactForm", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emptyValidation: 빈 폼 제출 → 인라인 에러, onSubmit 미호출", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.click(screen.getByRole("button", { name: /전송/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/이름을 입력해 주세요|이름은 1자 이상/)).toBeInTheDocument();
  });

  it("정상 제출 → onSubmit 호출 + 폼 reset", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-07T10:00:00Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = renderForm();
    await fillValidFields(user);
    // mount 후 1.5s 이상 경과
    vi.advanceTimersByTime(1600);
    await user.click(screen.getByRole("button", { name: /전송/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "김윤수",
        email: "me@example.com",
      }),
    );
    // form reset
    await waitFor(() => {
      expect(screen.getByLabelText(/이름/i)).toHaveValue("");
    });
  });

  it("honeypot: website 채워짐 → onSubmit 미호출 (silent 200)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-07T10:00:00Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit, container } = renderForm();
    await fillValidFields(user);
    // honeypot 강제 채움
    const honey = container.querySelector("input[name='website']") as HTMLInputElement;
    expect(honey).not.toBeNull();
    fireEvent.change(honey, { target: { value: "spambot" } });
    vi.advanceTimersByTime(2000);
    await user.click(screen.getByRole("button", { name: /전송/ }));
    // 약간의 microtask flush
    await Promise.resolve();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("tooFast: mount 후 1.5초 미만 제출 → captcha 노출 + onSubmit 미호출", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-07T10:00:00Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = renderForm();
    await fillValidFields(user);
    // mount 후 0.5초만 경과
    vi.advanceTimersByTime(500);
    await user.click(screen.getByRole("button", { name: /전송/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/잠시만요|확인이 필요|봇이 아닌/)).toBeInTheDocument();
  });

  it("beforeUnload: dirty 상태 → preventDefault", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/이름/i), "김");
    const evt = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("beforeUnload: pristine → preventDefault 안 함", async () => {
    renderForm();
    const evt = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it("autocomplete: name/email autocomplete attribute 정상", () => {
    renderForm();
    const nameInput = screen.getByLabelText(/이름/i);
    const emailInput = screen.getByLabelText(/이메일/i);
    expect(nameInput.getAttribute("autocomplete")).toMatch(/name|given-name/);
    expect(emailInput.getAttribute("autocomplete")).toBe("email");
  });

  it("honeypot 필드는 화면에 안 보이고 aria-hidden, tabIndex=-1", () => {
    const { container } = renderForm();
    const honey = container.querySelector("input[name='website']") as HTMLInputElement;
    expect(honey).not.toBeNull();
    expect(honey.getAttribute("aria-hidden")).toBe("true");
    expect(honey.tabIndex).toBe(-1);
    expect(honey.getAttribute("autocomplete")).toBe("off");
  });
});

describe("DirectContactCard", () => {
  it("email mailto: link 렌더", () => {
    render(<DirectContactCard email="bbabi0901@gmail.com" />);
    const mail = screen.getByRole("link", { name: /bbabi0901@gmail.com/ });
    expect(mail.getAttribute("href")).toBe("mailto:bbabi0901@gmail.com");
  });

  it("github 외부 link → target=_blank rel 포함 noopener+noreferrer", () => {
    render(<DirectContactCard email="x@y.z" github="https://github.com/YoonsooKim9" />);
    const gh = screen.getByRole("link", { name: /github/i });
    expect(gh.getAttribute("target")).toBe("_blank");
    expect(gh.getAttribute("rel")).toMatch(/noopener/);
    expect(gh.getAttribute("rel")).toMatch(/noreferrer/);
  });

  it("linkedin 미설정 → 링크 미렌더", () => {
    render(<DirectContactCard email="x@y.z" />);
    expect(screen.queryByRole("link", { name: /linkedin/i })).toBeNull();
  });
});
