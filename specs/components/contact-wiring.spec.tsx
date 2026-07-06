import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/tests/msw/server";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import { ContactClient } from "@/components/contact/ContactClient";

// Spy on Date.now so ContactForm's speed-check (elapsed >= 1500ms) is satisfied.
// mountedAt is set via useState(() => Date.now()) at render; submit uses Date.now() later.
// We make early calls return BASE_TIME and later calls return BASE_TIME + 2000.
let callCount = 0;
const BASE_TIME = 1_700_000_000_000;
let dateNowSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  callCount = 0;
  dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
    callCount++;
    return callCount <= 3 ? BASE_TIME : BASE_TIME + 2000;
  });
});

afterEach(() => {
  dateNowSpy.mockRestore();
});

async function renderAndSubmit() {
  render(<ContactClient email="test@example.com" />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/이름/), "홍길동");
  await user.type(screen.getByLabelText(/이메일/), "hong@example.com");
  await user.type(screen.getByLabelText(/메시지/), "안녕하세요. 테스트 메시지입니다.");
  await user.click(screen.getByRole("button", { name: /전송/ }));
}

describe("ContactClient - API wiring", () => {
  it("폼 제출 시 /api/node/contact POST 요청", async () => {
    let capturedBody: unknown;
    server.use(
      http.post("/api/node/contact", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, channel: "notion" });
      }),
    );

    await renderAndSubmit();

    await waitFor(() => {
      expect(capturedBody).toBeDefined();
    });

    expect(capturedBody).toMatchObject({ name: "홍길동", email: "hong@example.com" });
  });

  it("200 응답 → toast.success 호출", async () => {
    server.use(
      http.post("/api/node/contact", () => HttpResponse.json({ ok: true, channel: "notion" })),
    );

    await renderAndSubmit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("메시지를 받았어요. 빠르게 회신할게요.");
    });
  });

  it("503 응답 + mailto → toast.error 호출", async () => {
    server.use(
      http.post("/api/node/contact", () =>
        HttpResponse.json(
          { error: "contact_not_configured", mailto: "mailto:bbabi0901@gmail.com" },
          { status: 503 },
        ),
      ),
    );

    await renderAndSubmit();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("네트워크 에러 → toast.error 인터넷 연결", async () => {
    server.use(http.post("/api/node/contact", () => HttpResponse.error()));

    await renderAndSubmit();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("인터넷 연결을 확인해 주세요");
    });
  });

  it("요청 body에 elapsedMs 포함", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/node/contact", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, channel: "notion" });
      }),
    );

    await renderAndSubmit();

    await waitFor(() => {
      expect(capturedBody).toBeDefined();
    });

    expect(typeof capturedBody?.elapsedMs).toBe("number");
  });
});
