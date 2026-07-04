import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import { ContactClient } from "@/components/contact/ContactClient";

function renderContactClient() {
  return render(<ContactClient email="test@example.com" />);
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/이름/), "홍길동");
  await user.type(screen.getByLabelText(/이메일/), "hong@example.com");
  await user.type(screen.getByLabelText(/메시지/), "안녕하세요. 테스트 메시지입니다.");
  await user.click(screen.getByRole("button", { name: /보내기/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ContactClient - API wiring", () => {
  it("폼 제출 시 /api/node/contact POST 요청", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, channel: "notion" }),
    });

    renderContactClient();
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/node/contact",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("200 응답 → toast.success 호출", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, channel: "notion" }),
    });

    renderContactClient();
    await fillAndSubmit();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("메시지를 받았어요. 빠르게 회신할게요.");
    });
  });

  it("503 응답 + mailto → toast.error 호출", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: "contact_not_configured", mailto: "mailto:bbabi0901@gmail.com" }),
    });

    renderContactClient();
    await fillAndSubmit();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("네트워크 에러 → toast.error 인터넷 연결", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));

    renderContactClient();
    await fillAndSubmit();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("인터넷 연결을 확인해 주세요");
    });
  });

  it("요청 body에 elapsedMs 포함", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, channel: "notion" }),
    });

    renderContactClient();
    await fillAndSubmit();

    await waitFor(() => {
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse((call?.[1] as RequestInit)?.body as string);
      expect(typeof body.elapsedMs).toBe("number");
    });
  });
});
