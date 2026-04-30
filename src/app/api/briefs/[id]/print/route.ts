import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { renderPrintDocument } from "@/lib/export-content";

export const dynamic = "force-dynamic";

/**
 * Sert une page HTML autonome (sans layout Next) qui auto-déclenche
 * le print dialog du navigateur. L'utilisateur choisit "Enregistrer
 * en PDF" pour générer un PDF du contenu rédigé uniquement.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const [row] = await db
    .select({ keyword: brief.keyword, editorHtml: brief.editorHtml })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new Response(renderPrintDocument(row.keyword, row.editorHtml ?? ""), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
