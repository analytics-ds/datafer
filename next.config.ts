import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Outil interne : noindex sur toutes les réponses, y compris celles qui
  // ne passent pas par le rendu HTML (API, fichiers, redirections).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // corpus.datashake.fr est un relais Cloudflare Pages (corpus-proxy)
      // devant ce worker : le navigateur envoie Origin corpus.datashake.fr
      // alors que le worker voit le Host workers.dev. Sans cette liste, le
      // contrôle CSRF de Next rejette toutes les Server Actions (partage,
      // tags, dossiers, settings) en 500 depuis le sous-domaine.
      allowedOrigins: ["corpus.datashake.fr"],
    },
  },
};

// Bind Cloudflare resources (D1, secrets) to `next dev` so that
// `getCloudflareContext()` works locally without needing `wrangler dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
