// POST /api/clients/[id]/sitemap/resync
// Enqueue un message dans la queue `datafer-sitemap-sync` consommée par
// `datafer-analysis-consumer`. Le consumer dispose de 300s de CPU et
// pourra traiter même les gros e-com protégés (Celio/Datadome qui crawl
// en 3-10s par URL via Bright Data), avec ré-enqueue automatique d'un
// follow-up si toutes les URLs ne sont pas traitées en un tick.
//
// Le mode est "initial" si l'index est vide pour ce client, "incremental"
// sinon (rotation hebdo + ajouts récents).

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client, clientUrlIndex } from "@/db/schema";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const [row] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.scope === "personal" && row.ownerId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!row.sitemapUrl) {
    return NextResponse.json({ error: "no sitemap configured" }, { status: 400 });
  }

  const env = getCloudflareContext().env as unknown as DataferEnv;
  if (!env.SITEMAP_SYNC_QUEUE) {
    return NextResponse.json({ error: "queue binding missing" }, { status: 500 });
  }

  // Détermine le mode initial / incremental d'après l'état de l'index.
  const [existingCount] = await db
    .select({ id: clientUrlIndex.id })
    .from(clientUrlIndex)
    .where(eq(clientUrlIndex.clientId, id))
    .limit(1);
  const mode: "initial" | "incremental" = existingCount ? "incremental" : "initial";

  // Marque le client en "syncing" tout de suite pour que l'UI reflète l'état
  // sans attendre que le consumer ait pris le message.
  await db
    .update(client)
    .set({ sitemapStatus: "syncing", sitemapError: null })
    .where(eq(client.id, id));

  await env.SITEMAP_SYNC_QUEUE.send({ type: "sitemap-sync", clientId: id, mode });

  return NextResponse.json({ ok: true, queued: true, mode });
}
