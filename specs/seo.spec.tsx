import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { JsonLdPerson } from "@/components/seo/JsonLdPerson";

const ORIG_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://yoonsoo.dev";
});

afterEach(() => {
  if (ORIG_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIG_SITE_URL;
});

describe("sitemap", () => {
  it("contains all 4 public routes", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://yoonsoo.dev/");
    expect(urls).toContain("https://yoonsoo.dev/about");
    expect(urls).toContain("https://yoonsoo.dev/experience");
    expect(urls).toContain("https://yoonsoo.dev/contact");
    expect(entries.length).toBe(4);
  });

  it("uses NEXT_PUBLIC_SITE_URL as base", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    const entries = sitemap();
    expect(entries.every((e) => e.url.startsWith("https://example.test"))).toBe(true);
  });

  it("each entry has lastModified Date", () => {
    const entries = sitemap();
    for (const e of entries) {
      expect(e.lastModified).toBeInstanceOf(Date);
    }
  });

  it("does not include any /api/* path", () => {
    const entries = sitemap();
    expect(entries.every((e) => !e.url.includes("/api/"))).toBe(true);
  });
});

describe("robots", () => {
  it("allows / and disallows /api/", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const wildcard = rules.find((rule) => rule!.userAgent === "*");
    expect(wildcard).toBeDefined();
    expect(wildcard!.allow).toBe("/");
    const disallow = Array.isArray(wildcard!.disallow) ? wildcard!.disallow : [wildcard!.disallow!];
    expect(disallow).toContain("/api/");
  });

  it("includes sitemap URL pointing to NEXT_PUBLIC_SITE_URL/sitemap.xml", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://yoonsoo.dev/sitemap.xml");
  });
});

describe("JsonLdPerson", () => {
  it("renders a script tag with @type Person and @context schema.org", () => {
    const html = renderToStaticMarkup(<JsonLdPerson />);
    expect(html).toContain('type="application/ld+json"');
    const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const json = JSON.parse(match![1]!);
    expect(json["@context"]).toBe("https://schema.org");
    expect(json["@type"]).toBe("Person");
    expect(json.name).toBe("김윤수");
    expect(Array.isArray(json.sameAs)).toBe(true);
    expect((json.sameAs as string[]).some((s) => s.includes("github.com/YoonsooKim9"))).toBe(true);
  });

  it("does not include private info (telephone/address)", () => {
    const html = renderToStaticMarkup(<JsonLdPerson />);
    const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const json = JSON.parse(match![1]!);
    expect(json.telephone).toBeUndefined();
    expect(json.address).toBeUndefined();
  });
});
