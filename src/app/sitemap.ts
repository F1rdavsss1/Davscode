import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { cases } from "@/content/cases";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/cases`, changeFrequency: "monthly", priority: 0.8 },
    ...cases.map((c) => ({ url: `${site.url}/cases/${c.slug}`, changeFrequency: "yearly" as const, priority: 0.6 })),
    { url: `${site.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
