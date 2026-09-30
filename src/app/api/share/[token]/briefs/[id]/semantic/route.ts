import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { handleSemanticRequest } from "@/lib/semantic-paragraphs";

export const dynamic = "force-dynamic";

/**
 * Proximité sémantique des paragraphes via un lien de partage dossier. Même
 * calcul que la session consultant, pour que le client voie le même score.
 * Auth : le token du dossier auquel le brief est rattaché.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await context.params;
  const db = getDb();
  const [row] = await db
    .select({ nlpJson: brief.nlpJson, status: brief.status })
    .from(brief)
    .innerJoin(client, eq(client.id, brief.clientId))
    .where(and(eq(brief.id, id), eq(client.shareToken, token)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status !== "ready") return NextResponse.json({ centroidAvailable: false });

  return handleSemanticRequest(req, row.nlpJson);
}
