// POST /api/briefs/[id]/maillage
// Retourne les suggestions de maillage interne pour un brief, calculées à
// partir du HTML courant de l'éditeur fourni en body.
//
// Body : { editorHtml: string, maxSuggestions?: number }
// Response : { suggestions: MaillageSuggestion[], reason: string }

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { suggestInternalLinks } from "@/lib/maillage/suggest";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
    .where(eq(brief.id, id))
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
