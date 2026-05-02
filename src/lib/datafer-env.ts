/**
 * Type de l'env Cloudflare consommé par le code Datafer (briefs-service,
 * analysis, etc.). Définition centralisée pour pouvoir l'utiliser depuis
 * 2 contextes différents :
 *   - le worker Next.js (OpenNext) via getCloudflareContext().env
 *   - le worker consumer dédié datafer-analysis-consumer (queue) via
 *     l'argument `env` de la handler queue
 *
 * Tous les bindings et secrets sont marqués optionnels parce qu'on a un
 * mode dégradé "missing key returns null" (cf. crawlWithBrightData,
 * fetchHaloscan, etc.) plutôt qu'un crash dur.
 */

import type { CreateBriefInput } from "./briefs-service-types";

export type AnalysisMessage = {
  briefId: string;
  userId: string;
  input: CreateBriefInput;
};

export type DataferEnv = {
  // Bindings
  DB: D1Database;
  AI?: Ai;
  ANALYSIS_QUEUE?: Queue<AnalysisMessage>;
  // Vars
  SERP_PROVIDER?: string;
  CF_ACCOUNT_ID?: string;
  BETTER_AUTH_URL?: string;
  // Secrets
  BETTER_AUTH_SECRET?: string;
  CRAZYSERP_KEY?: string;
  CRAZYSERP_KEY_FALLBACK?: string;
  SERPAPI_KEY?: string;
  HALOSCAN_KEY?: string;
  BRIGHTDATA_TOKEN?: string;
  BRIGHTDATA_ZONE?: string;
  /**
   * URL WebSocket complète du Bright Data Scraping Browser (zone "scraping_browser1").
   * Format : wss://brd-customer-XXX-zone-YYY:PASSWORD@brd.superproxy.io:9222
   * Utilisé en niveau 3 de la cascade crawl (cf. crawlWithBrightDataBrowser).
   */
  BRIGHTDATA_BROWSER_WSS?: string;
  CF_BROWSER_TOKEN?: string;
  CRON_SECRET?: string;
};
