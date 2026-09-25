import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    // Customer booking pages and the admin are private; the lookup form has nothing to index.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/book/", "/lookup", "/sign-in", "/api/", "/design-system"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
