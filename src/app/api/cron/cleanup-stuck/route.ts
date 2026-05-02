import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { brief } from "@/db/schema";

export const dynamic = "force-dynamic";

// Briefs en `pending` depuis plus de 2 minutes : on les force en `failed`.
// ANALYSIS_DEADLINE_MS côté consumer = 90s, donc 2 min laisse 30s de marge
// avant qu'on considère un brief comme zombie. Combiné avec un cron qui
// tourne toutes les 1 min côté GH Actions, le worst-case d'attente côté
// user passe de 8 min (cron 5 + seuil 3) à 3 min.
const STUCK_THRESHOLD_MS = 2 * 60 * 1000;

export async function POST(req: Request) {
  // Auth via Bearer = secret CRON_SECRET. On compare en constant-time pour
  // éviter les timing attacks (faible enjeu mais c'est gratuit).
  const { env } = getCloudflareContext();
  const e = env as unknown as Record<string, string | undefined>;
  const expected = e.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!provided || provided.length !== expected.length) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  const db = getDb();
  const stuck = await db
    .select({ id: brief.id, keyword: brief.keyword, createdAt: brief.createdAt })
    .from(brief)
    .where(and(eq(brief.status, "pending"), lt(brief.createdAt, cutoff)));

  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, cleaned: 0, ids: [] });
  }

  await db
    .update(brief)
    .set({
      status: "failed",
      errorMessage: "analysis timed out (worker crashed before status update)",
      updatedAt: new Date(),
    })
    .where(and(eq(brief.status, "pending"), lt(brief.createdAt, cutoff)));

  console.log("[cron-cleanup] forced failed", {
    count: stuck.length,
    ids: stuck.map((s) => s.id),
  });

  return NextResponse.json({
    ok: true,
    cleaned: stuck.length,
    ids: stuck.map((s) => ({ id: s.id, keyword: s.keyword, createdAt: s.createdAt })),
  });
}
