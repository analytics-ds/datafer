// Cron periodic du maillage interne.
//
// Stratégie : à chaque tick, on prend les N clients dont la dernière sync est
// la plus ancienne (ou jamais syncés mais avec sitemapUrl configuré), et on
// enqueue un message par client dans la queue `datafer-sitemap-sync`. Le
// consumer dispose de 300s CPU pour traiter chaque message et ré-enqueue
// automatiquement un follow-up s'il reste du travail.
//
// Appelé par .github/workflows/maillage-sync.yml toutes les heures.

import { NextResponse } from "next/server";
import { asc, isNotNull, eq, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { client, clientUrlIndex } from "@/db/schema";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

const MAX_CLIENTS_PER_TICK = 10;

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

  if (!e.SITEMAP_SYNC_QUEUE) {
    return NextResponse.json({ error: "queue binding missing" }, { status: 500 });
  }

  const db = getDb();
  const t0 = Date.now();

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

  const enqueued: Array<{ clientId: string; mode: string }> = [];
  for (const c of clients) {
    const [hasUrls] = await db
      .select({ id: clientUrlIndex.id })
      .from(clientUrlIndex)
      .where(eq(clientUrlIndex.clientId, c.id))
      .limit(1);
    const mode: "initial" | "incremental" = hasUrls ? "incremental" : "initial";
    await e.SITEMAP_SYNC_QUEUE.send({ type: "sitemap-sync", clientId: c.id, mode });
    enqueued.push({ clientId: c.id, mode });
  }

  return NextResponse.json({ ok: true, durationMs: Date.now() - t0, enqueued });
}
