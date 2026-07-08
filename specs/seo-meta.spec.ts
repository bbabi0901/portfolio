import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import * as layoutModule from "@/app/layout";
import * as homePage from "@/app/page";
import * as aboutPage from "@/app/about/page";
import * as experiencePage from "@/app/experience/page";
import * as contactPage from "@/app/contact/page";
import * as notFoundPage from "@/app/not-found";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { JsonLdPerson } from "@/components/seo/JsonLdPerson";

function renderJsonLd(): string {
  return renderToStaticMarkup(createElement(JsonLdPerson));
}

const ORIG_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://yoonsoo.dev";
});

afterEach(() => {
  if (ORIG_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIG_SITE_URL;
});

describe("layout metadata", () => {
  const meta = layoutModule.metadata;

  it("title.template = '%s | 김윤수'", () => {
    expect(meta.title).toBeDefined();
    expect(typeof meta.title === "object" && meta.title !== null).toBe(true);
    const t = meta.title as { default: string; template: string };
    expect(t.template).toBe("%s | 김윤수");
    expect(t.default).toBe("김윤수 — AI Portfolio");
  });

  it("description is in Korean", () => {
    expect(typeof meta.description).toBe("string");
    expect(meta.description!).toMatch(/김윤수/);
    expect(meta.description!).toMatch(/[가-힣]/);
  });

  it("alternates.canonical = '/'", () => {
    expect(meta.alternates).toBeDefined();
    expect(meta.alternates!.canonical).toBe("/");
  });

  it("openGraph.locale = 'ko_KR'", () => {
    expect(meta.openGraph).toBeDefined();
    expect((meta.openGraph as { locale?: string }).locale).toBe("ko_KR");
  });

  it("openGraph.type = 'website'", () => {
    expect((meta.openGraph as { type?: string }).type).toBe("website");
  });

  it("twitter.card = 'summary_large_image'", () => {
    expect(meta.twitter).toBeDefined();
    expect((meta.twitter as { card?: string }).card).toBe("summary_large_image");
  });

  it("robots index/follow true", () => {
    expect(meta.robots).toBeDefined();
    const r = meta.robots as { index?: boolean; follow?: boolean };
    expect(r.index).toBe(true);
    expect(r.follow).toBe(true);
  });

  it("authors set with name 김윤수", () => {
    expect(meta.authors).toBeDefined();
    const authors = Array.isArray(meta.authors) ? meta.authors : [meta.authors];
    expect(authors.some((a) => (a as { name?: string }).name === "김윤수")).toBe(true);
  });

  it("keywords includes 프론트엔드/Next.js", () => {
    expect(meta.keywords).toBeDefined();
    const kws = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords];
    expect(kws.some((k) => k === "프론트엔드")).toBe(true);
    expect(kws.some((k) => k === "Next.js")).toBe(true);
  });

  it("metadataBase is a valid URL (NEXT_PUBLIC_SITE_URL or localhost fallback)", () => {
    expect(meta.metadataBase).toBeDefined();
    expect(meta.metadataBase).toBeInstanceOf(URL);
    expect((meta.metadataBase as URL).protocol).toMatch(/^https?:$/);
  });
});

describe("layout viewport", () => {
  const vp = layoutModule.viewport;

  it("themeColor = 라이트/다크 media 쌍", () => {
    expect(vp.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    ]);
  });

  it("colorScheme = 'light dark'", () => {
    expect(vp.colorScheme).toBe("light dark");
  });

  it("width = 'device-width'", () => {
    expect(vp.width).toBe("device-width");
  });

  it("initialScale = 1", () => {
    expect(vp.initialScale).toBe(1);
  });
});

describe("page-level metadata", () => {
  it("/ (chat) title = '대화'", () => {
    expect(homePage.metadata.title).toBe("대화");
    expect((homePage.metadata.alternates as { canonical?: string }).canonical).toBe("/");
  });

  it("/about title = '자기소개'", () => {
    expect(aboutPage.metadata.title).toBe("자기소개");
    expect((aboutPage.metadata.alternates as { canonical?: string }).canonical).toBe("/about");
  });

  it("/experience title = '커리어'", () => {
    expect(experiencePage.metadata.title).toBe("커리어");
    expect((experiencePage.metadata.alternates as { canonical?: string }).canonical).toBe(
      "/experience",
    );
  });

  it("/contact title = '연락하기'", () => {
    expect(contactPage.metadata.title).toBe("연락하기");
    expect((contactPage.metadata.alternates as { canonical?: string }).canonical).toBe("/contact");
  });

  it("not-found robots noindex/nofollow", () => {
    const r = notFoundPage.metadata.robots as {
      index?: boolean;
      follow?: boolean;
    };
    expect(r.index).toBe(false);
    expect(r.follow).toBe(false);
  });

  it("page metadata does not include explicit openGraph.images (uses auto OG)", () => {
    for (const m of [
      homePage.metadata,
      aboutPage.metadata,
      experiencePage.metadata,
      contactPage.metadata,
    ]) {
      const og = m.openGraph as { images?: unknown } | undefined;
      expect(og?.images).toBeUndefined();
    }
  });
});

describe("JsonLdPerson (regression)", () => {
  it("renders single script tag with @type Person", () => {
    const html = renderJsonLd();
    const matches = html.match(/<script[^>]*application\/ld\+json/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
    const inner = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!;
    const json = JSON.parse(inner);
    expect(json["@context"]).toBe("https://schema.org");
    expect(json["@type"]).toBe("Person");
  });

  it("sameAs includes github URL", () => {
    const html = renderJsonLd();
    const json = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!);
    expect(Array.isArray(json.sameAs)).toBe(true);
    expect((json.sameAs as string[]).some((s) => s.includes("github.com/YoonsooKim9"))).toBe(true);
  });

  it("knowsAbout array has 3+ entries", () => {
    const html = renderJsonLd();
    const json = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!);
    expect(Array.isArray(json.knowsAbout)).toBe(true);
    expect((json.knowsAbout as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it("includes url + description", () => {
    const html = renderJsonLd();
    const json = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!);
    expect(typeof json.url).toBe("string");
    expect(json.url.length).toBeGreaterThan(0);
    expect(typeof json.description).toBe("string");
  });

  it("does not leak telephone/address (private info)", () => {
    const html = renderJsonLd();
    const json = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!);
    expect(json.telephone).toBeUndefined();
    expect(json.address).toBeUndefined();
  });
});

describe("sitemap (4 routes)", () => {
  it("includes /, /about, /experience, /contact", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://yoonsoo.dev/");
    expect(urls).toContain("https://yoonsoo.dev/about");
    expect(urls).toContain("https://yoonsoo.dev/experience");
    expect(urls).toContain("https://yoonsoo.dev/contact");
  });

  it("uses NEXT_PUBLIC_SITE_URL as base", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    const entries = sitemap();
    expect(entries.every((e) => e.url.startsWith("https://example.test"))).toBe(true);
  });
});

describe("robots", () => {
  it("disallows /api/ AND /api/node/", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const wildcard = rules.find((rule) => rule!.userAgent === "*");
    expect(wildcard).toBeDefined();
    const disallow = Array.isArray(wildcard!.disallow)
      ? wildcard!.disallow!
      : [wildcard!.disallow!];
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/api/node/");
  });

  it("includes sitemap URL pointing to NEXT_PUBLIC_SITE_URL/sitemap.xml", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://yoonsoo.dev/sitemap.xml");
  });
});
