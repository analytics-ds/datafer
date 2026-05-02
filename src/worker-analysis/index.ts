/**
 * Worker dédié au traitement asynchrone des briefs Datafer.
 *
 * Architecture (depuis 2026-05-02) :
 *   - L'API HTTP (worker Next.js OpenNext "datafer") écrit le brief en
 *     "pending" puis push un message {briefId, userId, input} dans la
 *     queue Cloudflare `datafer-analysis`.
 *   - Ce worker (datafer-analysis-consumer) consomme la queue, run l'analyse
 *     complète (SERP + crawl + NLP + Haloscan + scoring) et update la BDD.
 *
 * Pourquoi un worker séparé du Next.js : isole le budget CPU/wall time.
 * Un brief sur SERP e-commerce lourde peut prendre 30-60s CPU + 60-90s wall.
 * En mode ctx.waitUntil dans le worker Next.js, ça tue parfois le worker
 * avant qu'il n'update le status (zombie). Ici on tourne dans notre propre
 * worker avec budget 30s CPU + 15 min wall + retries automatiques de la queue.
 */

import { completeBriefAnalysis } from "@/lib/briefs-service";
import type { DataferEnv, AnalysisMessage } from "@/lib/datafer-env";

export default {
  async queue(batch: MessageBatch<AnalysisMessage>, env: DataferEnv): Promise<void> {
    for (const msg of batch.messages) {
      const { briefId, userId, input } = msg.body;
      console.log("[analysis-consumer] processing", { briefId, keyword: input.keyword });
      try {
        await completeBriefAnalysis(env, briefId, userId, input);
        msg.ack();
      } catch (err) {
        // completeBriefAnalysis catch déjà ses propres erreurs et update le
        // status à "failed". Si on arrive ici, c'est un truc inattendu : on
        // laisse la queue retry (pas de msg.ack()) — sauf si c'est le dernier
        // essai, auquel cas la message file dans la DLQ.
        console.error("[analysis-consumer] uncaught error", { briefId, err: String(err) });
        msg.retry();
      }
    }
  },
};
