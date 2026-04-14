import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * API publique de sauvegarde d'un brief via un lien de partage.
 *
 * Auth : le token est la clé. Si brief.clientId référence bien un dossier
 * dont shareToken = token, on autorise l'écriture sur ce brief uniquement.
 * Pas de session, pas de cookie.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await context.params;

  const body = (await req.json().catch(() => null)) as {
    editorHtml?: string;
    score?: number;
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({ briefId: brief.id })
    .from(brief)
    .innerJoin(client, eq(client.id, brief.clientId))
    .where(and(eq(brief.id, id), eq(client.shareToken, token)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: {
    editorHtml?: string;
    score?: number | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (body.editorHtml !== undefined) patch.editorHtml = body.editorHtml;
  if (body.score !== undefined) patch.score = body.score;

  await db.update(brief).set(patch).where(eq(brief.id, id));

  return NextResponse.json({ ok: true });
}
