import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

const base = siteUrl();

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
