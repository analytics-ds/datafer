/**
 * Cleanup des briefs stuck en `pending` au-dela du seuil. Logique partagee
 * entre l'endpoint HTTP `/api/cron/cleanup-stuck` (trigger GH Actions de
 * backup) et le Cloudflare Cron Trigger natif sur le worker
 * `datafer-analysis-consumer` (trigger principal, fiable).
 *
 * Pourquoi un cron natif Cloudflare en plus de GH Actions : GH Actions
 * schedule est tres flaky (en pratique ~50-60min entre runs au lieu de
 * 1min annonce). Cloudflare Cron Triggers tournent a l'heure pile sans
 * latence et sont la source primaire pour ce cleanup.
 */

import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { brief } from "@/db/schema";

// Heartbeat-based: on tue uniquement les briefs qui ont COMMENCÉ à être
// traités (analysis_step != NULL) ET dont le worker n'a pas mis à jour
// leur step depuis HEARTBEAT_STALE_MS.
//
// Pourquoi cette logique :
//   - Un brief encore en file (`analysis_step IS NULL`) ne doit pas être
//     tué : il attend juste son tour. Le bulk de 5 briefs séquentiels
//     peut attendre 4-5 min sans souci.
//   - Un brief actif (worker vivant) appelle `setStep()` à chaque étape
//     (fetching_serp → crawling:N/10 → analyzing_nlp → scoring → saving),
//     ce qui rafraîchit `updatedAt` toutes les 5-30s. Si `updatedAt` est
//     figé > HEARTBEAT_STALE_MS, le worker est mort (OOM, kill, exception
//     non catchée).
//   - 180s : la step la plus longue (`crawling:N/10`) peut traîner sur un
//     site Cloudflare-protected qui passe en fallback Bright Data Browser
//     CDP (jusqu'à 60-90s pour un site JS-heavy comme Nike Snkrs ou un
//     site finance). C'est une garde wall-time pour les KW lourds
//     ("comment investir en bourse", "plombier paris", etc.) qui crawlent
//     légitimement 100-150s, pas une garde CPU.
const HEARTBEAT_STALE_MS = 180 * 1000;

// Garde d'âge absolu pour les briefs JAMAIS pris par le consumer
// (`analysis_step IS NULL`). Le filet heartbeat ci-dessus les ignore par
// construction, puisqu'un brief qui attend son tour dans la file est
// legitimement sans step. Mais si la queue ne delivre plus rien (panne
// Cloudflare du 2026-09-02 : livraison morte pendant des heures, API en 500
// sur toute tentative de reparation), ces briefs restent `pending` a 5 %
// « En attente » indefiniment, sans jamais alerter personne. Un brief du
// 2026-05-08 est ainsi reste bloque quatre mois.
//
// 15 min : tres au-dessus du pire temps d'attente legitime en file. Un bulk
// de 5 briefs se vide en 4-5 min avec max_concurrency=3, donc on ne risque
// pas de tuer un brief qui allait partir. En dessous, on tuerait des briefs
// sains lors d'un gros bulk.
const ORPHAN_STALE_MS = 15 * 60 * 1000;

export type CleanupResult = {
  cleaned: number;
  ids: Array<{ id: string; keyword: string; createdAt: Date | null }>;
  /** Briefs jamais pris par le consumer, tues par la garde d'age absolu. */
  orphaned: number;
  orphanedIds: Array<{ id: string; keyword: string; createdAt: Date | null }>;
};

export async function cleanupStuckBriefs(db: D1Database): Promise<CleanupResult> {
  const orm = drizzle(db, { schema });
  const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);
  const stuck = await orm
    .select({ id: brief.id, keyword: brief.keyword, createdAt: brief.createdAt })
    .from(brief)
    .where(
      and(
        eq(brief.status, "pending"),
        isNotNull(brief.analysisStep),
        lt(brief.updatedAt, cutoff),
      ),
    );

  // Bascule en status='failed' au lieu de supprimer (changement 2026-05-28) :
  // l'ancien auto-delete cachait les bugs aux clients API qui voyaient un 404
  // sur le GET (ex : brief IT qui atteint "saving" puis worker meurt avant
  // l'UPDATE final). En gardant le brief en failed avec un errorMessage
  // explicite, on peut diagnostiquer et le client API a une réponse propre.
  if (stuck.length > 0) {
    await orm
      .update(brief)
      .set({
        status: "failed",
        errorMessage: "worker stuck > 180s (likely crash during analysis)",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(brief.status, "pending"),
          isNotNull(brief.analysisStep),
          lt(brief.updatedAt, cutoff),
        ),
      );

    console.log("[cleanup-stuck] marked stuck briefs as failed", {
      count: stuck.length,
      ids: stuck.map((s) => s.id),
    });
  }

  // Deuxieme filet : les briefs jamais pris par le consumer. Filtre =
  // `analysis_step IS NULL` + createdAt plus vieux que ORPHAN_STALE_MS. On se
  // base sur createdAt et pas updatedAt : un brief sans step n'a jamais ete
  // touche, donc son updatedAt vaut son createdAt, mais createdAt dit
  // explicitement ce qu'on mesure, l'age du brief et pas une absence de
  // heartbeat.
  const orphanCutoff = new Date(Date.now() - ORPHAN_STALE_MS);
  const orphans = await orm
    .select({ id: brief.id, keyword: brief.keyword, createdAt: brief.createdAt })
    .from(brief)
    .where(
      and(
        eq(brief.status, "pending"),
        isNull(brief.analysisStep),
        lt(brief.createdAt, orphanCutoff),
      ),
    );

  if (orphans.length > 0) {
    await orm
      .update(brief)
      .set({
        status: "failed",
        errorMessage:
          "brief jamais pris par le worker d'analyse (file d'attente bloquee), relancez-le",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(brief.status, "pending"),
          isNull(brief.analysisStep),
          lt(brief.createdAt, orphanCutoff),
        ),
      );

    console.log("[cleanup-stuck] marked orphan briefs as failed", {
      count: orphans.length,
      ids: orphans.map((s) => s.id),
    });
  }

  return {
    cleaned: stuck.length,
    ids: stuck.map((s) => ({ id: s.id, keyword: s.keyword, createdAt: s.createdAt })),
    orphaned: orphans.length,
    orphanedIds: orphans.map((s) => ({ id: s.id, keyword: s.keyword, createdAt: s.createdAt })),
  };
}
