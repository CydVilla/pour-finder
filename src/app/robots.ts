import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing here is secret, but there's no reason to spend crawl budget
      // on the API or the moderation queue.
      disallow: ["/api/", "/admin"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
