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

import { and, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { brief } from "@/db/schema";

const STUCK_THRESHOLD_MS = 2 * 60 * 1000;

export type CleanupResult = {
  cleaned: number;
  ids: Array<{ id: string; keyword: string; createdAt: Date | null }>;
};

export async function cleanupStuckBriefs(db: D1Database): Promise<CleanupResult> {
  const orm = drizzle(db, { schema });
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  const stuck = await orm
    .select({ id: brief.id, keyword: brief.keyword, createdAt: brief.createdAt })
    .from(brief)
    .where(and(eq(brief.status, "pending"), lt(brief.createdAt, cutoff)));

  if (stuck.length === 0) return { cleaned: 0, ids: [] };

  await orm
    .update(brief)
    .set({
      status: "failed",
      errorMessage: "analysis timed out (worker crashed before status update)",
      updatedAt: new Date(),
    })
    .where(and(eq(brief.status, "pending"), lt(brief.createdAt, cutoff)));

  console.log("[cleanup-stuck] forced failed", {
    count: stuck.length,
    ids: stuck.map((s) => s.id),
  });

  return {
    cleaned: stuck.length,
    ids: stuck.map((s) => ({ id: s.id, keyword: s.keyword, createdAt: s.createdAt })),
  };
}
