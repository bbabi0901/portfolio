import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import MaintenancePage, { metadata } from "@/app/maintenance/page";

describe("MaintenancePage - metadata", () => {
  it("title이 올바르게 설정됨", () => {
    expect(metadata.title).toBe("잠시 후 다시 만나요");
  });

  it("robots: index=false, follow=false", () => {
    const robots = metadata.robots as { index: boolean; follow: boolean };
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(false);
  });
});

describe("MaintenancePage - render", () => {
  it("제목 렌더링", () => {
    render(<MaintenancePage />);
    expect(screen.getByRole("heading")).toHaveTextContent("오늘의 대화 한도에 도달했어요");
  });

  it("KST 리셋 안내 문구 포함", () => {
    render(<MaintenancePage />);
    expect(screen.getByText(/KST/)).toBeTruthy();
  });

  it("이메일 링크 포함", () => {
    render(<MaintenancePage />);
    const link = screen.getByRole("link", { name: /bbabi0901/ });
    expect(link).toHaveAttribute("href", "mailto:bbabi0901@gmail.com");
  });

  it("홈으로 링크 포함", () => {
    render(<MaintenancePage />);
    const homeLink = screen.getByRole("link", { name: /홈으로/ });
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
