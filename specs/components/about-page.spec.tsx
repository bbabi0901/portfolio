import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { AboutHero } from "@/components/about/AboutHero";
import { AboutSection } from "@/components/about/AboutSection";

describe("AboutHero", () => {
  it("imageUrl null → SVG initial fallback", () => {
    const { container } = render(
      <AboutHero
        intro="한 줄 소개"
        imageUrl={null}
        totalReadingMinutes={1}
      />,
    );
    const svg = container.querySelector("svg[data-slot='profile-fallback']");
    expect(svg).not.toBeNull();
  });

  it("imageUrl 있음 → next/image 가 렌더된다", () => {
    render(
      <AboutHero
        intro="한 줄 소개"
        imageUrl="/profile.jpg"
        totalReadingMinutes={1}
      />,
    );
    const img = screen.getByAltText(/김윤수/);
    expect(img).toBeInTheDocument();
  });

  it("'약 X분 읽기' 표시", () => {
    render(
      <AboutHero intro="X" imageUrl={null} totalReadingMinutes={3} />,
    );
    expect(screen.getByText(/약 3분/)).toBeInTheDocument();
  });

  it("intro 텍스트 렌더", () => {
    render(
      <AboutHero
        intro="프론트엔드 + 스마트컨트랙트 개발자"
        imageUrl={null}
        totalReadingMinutes={1}
      />,
    );
    expect(
      screen.getByText(/프론트엔드 \+ 스마트컨트랙트 개발자/),
    ).toBeInTheDocument();
  });
});

describe("AboutSection", () => {
  it("heading 렌더", () => {
    render(
      <AboutSection
        heading="성격"
        subSections={[{ body: "내용" }]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: /성격/ }),
    ).toBeInTheDocument();
  });

  it("subSection heading 이 있으면 H3 으로 렌더", () => {
    render(
      <AboutSection
        heading="성격"
        subSections={[{ heading: "MBTI", body: "ENFP" }]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: /MBTI/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ENFP/)).toBeInTheDocument();
  });

  it("subSections markdown 렌더 (bold)", () => {
    render(
      <AboutSection
        heading="X"
        subSections={[{ body: "**굵은텍스트**" }]}
      />,
    );
    const strong = screen.getByText(/굵은텍스트/);
    expect(strong.tagName.toLowerCase()).toBe("strong");
  });

  it("외부 link 는 target=_blank rel=noopener noreferrer", () => {
    render(
      <AboutSection
        heading="X"
        subSections={[{ body: "[link](https://example.com)" }]}
      />,
    );
    const link = screen.getByRole("link", { name: /link/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    expect(link.getAttribute("rel")).toMatch(/noreferrer/);
  });
});
