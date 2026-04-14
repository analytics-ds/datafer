import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

// Bind Cloudflare resources (D1, secrets) to `next dev` so that
// `getCloudflareContext()` works locally without needing `wrangler dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
