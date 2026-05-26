// Cron periodic du maillage interne.
//
// Stratégie : à chaque tick, on prend les N clients dont la dernière sync est
// la plus ancienne (ou jamais syncés mais avec sitemapUrl configuré), et on
// les traite en mode "incremental" (ou "initial" si l'index est vide). On
// alloue un budget CPU global pour rester sous le timeout du worker Next.js
// (~25s). Si tous les clients ne peuvent pas être traités en un tick, le
// suivant prendra le relais (les clients déjà traités auront un
// sitemapLastSyncAt récent et passeront en fin de file).
//
// Appelé par .github/workflows/maillage-sync.yml toutes les heures.

import { NextResponse } from "next/server";
import { asc, isNotNull, eq, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { client, clientUrlIndex } from "@/db/schema";
import { syncClientSitemap } from "@/lib/maillage/sync";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

const PER_TICK_BUDGET_MS = 22_000;
const MAX_CLIENTS_PER_TICK = 5;

export async function POST(req: Request) {
  const { env } = getCloudflareContext();
  const e = env as unknown as DataferEnv;
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

  const db = getDb();
  const t0 = Date.now();
  const stopAt = t0 + PER_TICK_BUDGET_MS;

  // Sélectionne les clients avec sitemap configuré, ordonnés par dernière sync
  // ASC (les plus en retard d'abord). NULL d'abord (jamais syncés).
  const clients = await db
    .select({
      id: client.id,
      sitemapLastSyncAt: client.sitemapLastSyncAt,
    })
    .from(client)
    .where(isNotNull(client.sitemapUrl))
    .orderBy(asc(sql`coalesce(${client.sitemapLastSyncAt}, 0)`))
    .limit(MAX_CLIENTS_PER_TICK)
    .all();

  const results: Array<{ clientId: string; ok: boolean; mode: string; added: number; checked: number; error?: string }> = [];

  for (const c of clients) {
    if (Date.now() > stopAt) break;
    const remaining = stopAt - Date.now();
    if (remaining < 3000) break;

    const [hasUrls] = await db
      .select({ id: clientUrlIndex.id })
      .from(clientUrlIndex)
      .where(eq(clientUrlIndex.clientId, c.id))
      .limit(1);
    const mode: "initial" | "incremental" = hasUrls ? "incremental" : "initial";

    const r = await syncClientSitemap(db, e.AI, c.id, mode, { cpuBudgetMs: remaining });
    results.push({
      clientId: c.id,
      ok: r.ok,
      mode: r.mode,
      added: r.urlsAdded,
      checked: r.urlsChecked,
      ...(r.error ? { error: r.error } : {}),
    });
  }

  return NextResponse.json({ ok: true, durationMs: Date.now() - t0, processed: results });
}
