import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { handleSemanticRequest } from "@/lib/semantic-paragraphs";

export const dynamic = "force-dynamic";

/**
 * Proximité sémantique des paragraphes via le lien de partage d'un brief seul.
 * Même calcul que la session consultant, pour que le client voie le même score.
 */
export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = getDb();
  const [row] = await db
    .select({ nlpJson: brief.nlpJson, status: brief.status })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status !== "ready") return NextResponse.json({ centroidAvailable: false });

  return handleSemanticRequest(req, row.nlpJson);
}
