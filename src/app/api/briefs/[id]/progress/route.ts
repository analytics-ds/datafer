import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Suivi temps réel de l'analyse d'un brief. Le frontend (form de
 * création) poll cet endpoint toutes les 1.5s pendant le loading.
 *
 * Retourne :
 *   - status : "pending" | "ready" | "failed"
 *   - analysisStep : "fetching_serp" | "crawling" | "analyzing_nlp" | "scoring" | null
 *   - errorMessage : message d'erreur si status = "failed"
 *   - redirect : URL de redirection une fois ready
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const [row] = await db
    .select({
      status: brief.status,
      analysisStep: brief.analysisStep,
      errorMessage: brief.errorMessage,
    })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    status: row.status,
    analysisStep: row.analysisStep,
    errorMessage: row.errorMessage,
    redirect: row.status === "ready" ? `/app/briefs/${id}` : null,
  });
}
