import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Écriture publique d'un brief partagé individuellement. Seul le porteur du
 * token peut éditer, et uniquement ce brief-là.
 */
export async function PATCH(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const body = (await req.json().catch(() => null)) as {
    editorHtml?: string;
    score?: number;
    workflowStatus?: "pending" | "in_progress" | "drafted" | "published";
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({ id: brief.id })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: {
    editorHtml?: string;
    score?: number | null;
    workflowStatus?: "pending" | "in_progress" | "drafted" | "published";
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (body.editorHtml !== undefined) patch.editorHtml = body.editorHtml;
  if (body.score !== undefined) patch.score = body.score;
  if (body.workflowStatus !== undefined) {
    if (!["pending", "in_progress", "drafted", "published"].includes(body.workflowStatus))
      return NextResponse.json({ error: "bad workflowStatus" }, { status: 400 });
    patch.workflowStatus = body.workflowStatus;
  }

  await db.update(brief).set(patch).where(eq(brief.id, row.id));

  return NextResponse.json({ ok: true });
}
