// POST /api/share-brief/[token]/maillage
// Variante publique du endpoint maillage : lookup par shareToken au lieu
// de session auth. Aucune écriture, donc safe à exposer sans auth.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { suggestInternalLinks } from "@/lib/maillage/suggest";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const body = (await req.json().catch(() => null)) as {
    editorHtml?: string;
    maxSuggestions?: number;
  } | null;
  if (!body || typeof body.editorHtml !== "string") {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({ id: brief.id, clientId: brief.clientId })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!row.clientId) {
    return NextResponse.json({ suggestions: [], reason: "no_client" });
  }

  const env = getCloudflareContext().env as unknown as DataferEnv;
  const result = await suggestInternalLinks(db, env.AI, {
    clientId: row.clientId,
    editorHtml: body.editorHtml,
    maxSuggestions: body.maxSuggestions,
  });
  return NextResponse.json(result);
}
