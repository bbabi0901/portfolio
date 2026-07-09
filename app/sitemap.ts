import type { MetadataRoute } from "next";

const ROUTES = ["/", "/chat", "/about", "/experience", "/contact"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lastModified = new Date();
  return ROUTES.map((r) => ({ url: `${base}${r}`, lastModified }));
}
