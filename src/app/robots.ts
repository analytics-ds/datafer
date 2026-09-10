import type { MetadataRoute } from "next";

/* corpus est un outil interne datashake : rien ne doit être crawlé ni
   indexé, ni par un moteur ni par un crawler de LLM. Le noindex est aussi
   posé en balise meta (layout.tsx) et en header X-Robots-Tag
   (next.config.ts), pour les réponses non HTML. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
