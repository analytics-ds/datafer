/**
 * Worker dédié au traitement asynchrone des briefs Datafer.
 *
 * Architecture (depuis 2026-05-02) :
 *   - L'API HTTP (worker Next.js OpenNext "datafer") écrit le brief en
 *     "pending" puis push un message {briefId, userId, input} dans la
 *     queue Cloudflare `datafer-analysis`.
 *   - Ce worker (datafer-analysis-consumer) consomme la queue, run l'analyse
 *     complète (SERP + crawl + NLP + Haloscan + scoring) et update la BDD.
 *   - Un Cloudflare Cron Trigger (`* * * * *`) appelle aussi ce worker via
 *     `scheduled()` pour purger les briefs zombies (depuis 2026-05-03 :
 *     remplace le cron GH Actions trop flaky).
 *
 * Pourquoi un worker séparé du Next.js : isole le budget CPU/wall time.
 * Un brief sur SERP e-commerce lourde peut prendre 30-60s CPU + 60-90s wall.
 * En mode ctx.waitUntil dans le worker Next.js, ça tue parfois le worker
 * avant qu'il n'update le status (zombie). Ici on tourne dans notre propre
 * worker avec budget 30s CPU + 15 min wall + retries automatiques de la queue.
 */

import { drizzle } from "drizzle-orm/d1";
import { completeBriefAnalysis } from "@/lib/briefs-service";
import { cleanupStuckBriefs } from "@/lib/cleanup-stuck";
import { syncClientSitemap } from "@/lib/maillage/sync";
import * as schema from "@/db/schema";
import type { DataferEnv, AnalysisMessage } from "@/lib/datafer-env";
import type { SitemapSyncMessage } from "@/lib/maillage/types";

// Budget CPU pour une invocation du consumer sitemap. On laisse 20s de marge
// sous la limite Workers Paid 300s pour faire l'écriture finale + ré-enqueue
// d'un follow-up si hasMore=true.
const SITEMAP_SYNC_BUDGET_MS = 280_000;

export default {
  async queue(
    batch: MessageBatch<AnalysisMessage | SitemapSyncMessage>,
    env: DataferEnv,
  ): Promise<void> {
    // Dispatch selon la queue source : ce worker écoute 2 queues, une pour
    // les analyses de briefs et une pour la sync sitemap maillage.
    if (batch.queue === "datafer-sitemap-sync") {
      await handleSitemapSyncBatch(batch as MessageBatch<SitemapSyncMessage>, env);
      return;
    }
    await handleAnalysisBatch(batch as MessageBatch<AnalysisMessage>, env);
  },

  /**
   * Trigger Cloudflare Cron natif (cf. wrangler-analysis.toml [triggers]).
   * Tourne toutes les minutes et purge les briefs `pending` au-delà de 2 min
   * en `failed`. Source de vérité du cleanup (GH Actions reste en backup).
   */
  async scheduled(_controller: ScheduledController, env: DataferEnv): Promise<void> {
    try {
      const res = await cleanupStuckBriefs(env.DB as D1Database);
      console.log("[analysis-consumer:cron] cleanup", res);
    } catch (err) {
      console.error("[analysis-consumer:cron] cleanup failed", { err: String(err) });
    }
  },
};

async function handleAnalysisBatch(
  batch: MessageBatch<AnalysisMessage>,
  env: DataferEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    const { briefId, userId, input } = msg.body;
    console.log("[analysis-consumer] processing", { briefId, keyword: input.keyword });
    try {
      await completeBriefAnalysis(env, briefId, userId, input);
      msg.ack();
    } catch (err) {
      // completeBriefAnalysis catch déjà ses propres erreurs et bascule le
      // brief en status="failed" avec errorMessage. Si on arrive ici, c'est un
      // truc inattendu (ex : exception avant le try/catch interne) : on laisse
      // la queue retry (pas de msg.ack()) — sauf si c'est le dernier essai,
      // auquel cas le message file dans la DLQ et le cron cleanup-stuck (2 min)
      // ramassera le brief resté pending.
      console.error("[analysis-consumer] uncaught error", { briefId, err: String(err) });
      msg.retry();
    }
  }
}

async function handleSitemapSyncBatch(
  batch: MessageBatch<SitemapSyncMessage>,
  env: DataferEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    const { clientId, mode } = msg.body;
    console.log("[sitemap-consumer] processing", { clientId, mode });
    try {
      const db = drizzle(env.DB as D1Database, { schema });
      const result = await syncClientSitemap(db, env.AI, clientId, mode, {
        cpuBudgetMs: SITEMAP_SYNC_BUDGET_MS,
        brightData: { BRIGHTDATA_TOKEN: env.BRIGHTDATA_TOKEN, BRIGHTDATA_ZONE: env.BRIGHTDATA_ZONE },
      });
      console.log("[sitemap-consumer] done", {
        clientId,
        ok: result.ok,
        added: result.urlsAdded,
        checked: result.urlsChecked,
        hasMore: result.hasMore,
      });

      // Si on n'a pas tout fini, on ré-enqueue un follow-up. Même mode :
      // un initial qui n'a pas pu tout cruncher continue en "initial" pour
      // que les URLs nouvelles soient traitées en priorité.
      if (result.ok && result.hasMore && env.SITEMAP_SYNC_QUEUE) {
        await env.SITEMAP_SYNC_QUEUE.send({ type: "sitemap-sync", clientId, mode });
        console.log("[sitemap-consumer] re-enqueued follow-up", { clientId });
      }

      msg.ack();
    } catch (err) {
      console.error("[sitemap-consumer] uncaught error", { clientId, err: String(err) });
      msg.retry();
    }
  }
}
