// POST /api/clients/[id]/sitemap/resync
// Déclenche une synchronisation du sitemap d'un client. Le mode est :
//   - "initial" si jamais synchronisé (aucune URL dans l'index)
//   - "incremental" sinon (rotation hebdo + ajouts récents)
//
// La sync est lancée inline avec un budget court (20s) pour donner un retour
// rapide à l'UI. Si toutes les URLs ne sont pas traitées, le client reste en
// status="syncing" et le cron périodique reprend là où on s'est arrêté.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client, clientUrlIndex } from "@/db/schema";
import { syncClientSitemap } from "@/lib/maillage/sync";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

const INLINE_BUDGET_MS = 20_000;

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

  // Mode initial si l'index est vide pour ce client.
  const [existingCount] = await db
    .select({ id: clientUrlIndex.id })
    .from(clientUrlIndex)
    .where(eq(clientUrlIndex.clientId, id))
    .limit(1);
  const mode: "initial" | "incremental" = existingCount ? "incremental" : "initial";

  const result = await syncClientSitemap(db, env.AI, id, mode, { cpuBudgetMs: INLINE_BUDGET_MS });
  return NextResponse.json(result);
}
