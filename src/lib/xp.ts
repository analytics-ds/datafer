import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, user } from "@/db/schema";

/**
 * Gamification : système de niveaux par consultant.
 *
 * Règles d'XP :
 * - +10 XP à la création d'un brief
 * - +20 XP si le score du brief atteint la médiane des concurrents top 10
 * - +50 XP si le score dépasse le meilleur concurrent (top 1 SERP)
 *
 * Les trois flags sont **idempotents** (cf. brief.xpAwarded) : une fois
 * acquis, l'XP est définitif. Le user ne peut pas farmer en faisant
 * monter/descendre son score.
 *
 * Progression : `level = floor(sqrt(2 * xp / 100)) + 1`
 * - Lv 1 :    0 XP requis (palier suivant à 100)
 * - Lv 2 :  100 XP
 * - Lv 3 :  300 XP
 * - Lv 4 :  600 XP
 * - Lv 5 : 1000 XP
 * - Lv 10: 4500 XP
 * - Lv 20: 19000 XP
 * Formule cumulée : `xpForLevel(n) = 50 * n * (n-1)`.
 */

export const XP_BRIEF_CREATED = 10;
export const XP_ABOVE_MEDIAN = 20;
export const XP_ABOVE_BEST = 50;

export type XpAwarded = {
  created?: boolean;
  aboveMedian?: boolean;
  aboveBest?: boolean;
};

export type XpEvent = "created" | "aboveMedian" | "aboveBest";

/** XP cumulé requis pour atteindre le niveau `level` (level ≥ 1). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * level * (level - 1);
}

/**
 * Calcule le niveau actuel + la progression vers le niveau suivant à partir
 * du cumul XP. Toujours retourne level ≥ 1.
 */
export function levelFromXp(xp: number): {
  level: number;
  xpInLevel: number;
  xpToNextLevel: number;
  nextLevelAt: number;
  currentLevelAt: number;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  // level = floor(sqrt(2 * xp / 100)) + 1 ; pris large puis ajusté.
  let level = Math.max(1, Math.floor(Math.sqrt((safeXp * 2) / 100)) + 1);
  while (xpForLevel(level + 1) <= safeXp) level++;
  while (xpForLevel(level) > safeXp) level--;
  const currentLevelAt = xpForLevel(level);
  const nextLevelAt = xpForLevel(level + 1);
  return {
    level,
    xpInLevel: safeXp - currentLevelAt,
    xpToNextLevel: nextLevelAt - safeXp,
    nextLevelAt,
    currentLevelAt,
  };
}

export function parseXpAwarded(json: string | null | undefined): XpAwarded {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as XpAwarded) : {};
  } catch {
    return {};
  }
}

function xpValueForEvent(event: XpEvent): number {
  switch (event) {
    case "created":
      return XP_BRIEF_CREATED;
    case "aboveMedian":
      return XP_ABOVE_MEDIAN;
    case "aboveBest":
      return XP_ABOVE_BEST;
  }
}

/**
 * Award XP au user `ownerId` pour un événement sur `briefId`, si le flag
 * n'est pas déjà set. Idempotent : appeler 2× le même event ne donne pas
 * 2× l'XP. Retourne le nouvel XP cumulé du user, ou null si rien n'a été
 * award (flag déjà set).
 */
export async function awardBriefXp(
  briefId: string,
  ownerId: string,
  event: XpEvent,
): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ xpAwarded: brief.xpAwarded })
    .from(brief)
    .where(eq(brief.id, briefId))
    .limit(1);
  if (!row) return null;

  const awarded = parseXpAwarded(row.xpAwarded);
  if (awarded[event]) return null; // déjà donné

  const next: XpAwarded = { ...awarded, [event]: true };
  const delta = xpValueForEvent(event);

  await db.update(brief).set({ xpAwarded: JSON.stringify(next) }).where(eq(brief.id, briefId));
  await db
    .update(user)
    .set({ totalXp: sql`${user.totalXp} + ${delta}`, updatedAt: new Date() })
    .where(eq(user.id, ownerId));

  const [refreshed] = await db
    .select({ totalXp: user.totalXp })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  return refreshed?.totalXp ?? null;
}

/**
 * Réévalue les flags aboveMedian/aboveBest pour un brief vis-à-vis des
 * scores concurrents `competitorScores` (raw 0-100). Award l'XP
 * correspondant si un seuil est franchi pour la première fois.
 *
 * Convention : on compare `rawScore` (échelle 0-100 brute, même que les
 * concurrents) ; le score affiché user (calibré relatif à la médiane) n'est
 * pas comparable directement avec les concurrents.
 *
 * - aboveMedian : rawScore ≥ median(competitorScores)
 * - aboveBest   : rawScore  > max(competitorScores)
 */
export async function evaluateScoreXp(
  briefId: string,
  ownerId: string,
  rawScore: number,
  competitorScores: number[],
): Promise<{ awardedMedian: boolean; awardedBest: boolean; totalXp: number | null }> {
  if (!Number.isFinite(rawScore) || competitorScores.length === 0) {
    return { awardedMedian: false, awardedBest: false, totalXp: null };
  }
  const sorted = [...competitorScores].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { awardedMedian: false, awardedBest: false, totalXp: null };
  }
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const best = sorted[sorted.length - 1];

  let awardedMedian = false;
  let awardedBest = false;
  let lastXp: number | null = null;

  if (rawScore >= median) {
    const xp = await awardBriefXp(briefId, ownerId, "aboveMedian");
    if (xp !== null) {
      awardedMedian = true;
      lastXp = xp;
    }
  }
  if (rawScore > best) {
    const xp = await awardBriefXp(briefId, ownerId, "aboveBest");
    if (xp !== null) {
      awardedBest = true;
      lastXp = xp;
    }
  }

  return { awardedMedian, awardedBest, totalXp: lastXp };
}
