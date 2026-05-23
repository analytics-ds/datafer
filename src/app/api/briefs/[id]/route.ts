import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { detachAllTagsFromBrief } from "@/lib/tags-service";
import { evaluateScoreXp } from "@/lib/xp";
import type { NlpResult } from "@/lib/analysis";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    editorHtml?: string;
    score?: number;
    rawScore?: number;
    clientId?: string | null;
    workflowStatus?: "pending" | "in_progress" | "drafted" | "published";
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const db = getDb();

  // Workspace partagé : tout user authentifié peut éditer n'importe quel brief.
  const [row] = await db
    .select({ id: brief.id, clientId: brief.clientId, ownerId: brief.ownerId, nlpJson: brief.nlpJson })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: {
    editorHtml?: string;
    score?: number | null;
    clientId?: string | null;
    workflowStatus?: "pending" | "in_progress" | "drafted" | "published";
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (body.editorHtml !== undefined) patch.editorHtml = body.editorHtml;
  if (body.score !== undefined) patch.score = body.score;
  if (body.clientId !== undefined) patch.clientId = body.clientId;
  if (body.workflowStatus !== undefined) {
    if (!["pending", "in_progress", "drafted", "published"].includes(body.workflowStatus))
      return NextResponse.json({ error: "bad workflowStatus" }, { status: 400 });
    patch.workflowStatus = body.workflowStatus;
  }

  // Si le brief change de client, ses tags actuels appartiennent à l'ancien
  // client et ne sont plus dans le scope du nouveau. On les détache pour
  // éviter des liens fantômes invisibles dans le picker.
  const clientChanged = body.clientId !== undefined && body.clientId !== row.clientId;
  if (clientChanged) {
    await detachAllTagsFromBrief(id);
  }

  await db.update(brief).set(patch).where(eq(brief.id, id));

  // XP : si le score raw franchit la médiane / le best concurrent pour la
  // 1re fois, on award. Best-effort, idempotent côté evaluateScoreXp via
  // les flags brief.xpAwarded. On utilise l'owner du brief (et non la
  // session courante) pour rester cohérent avec le créateur du contenu.
  if (typeof body.rawScore === "number" && Number.isFinite(body.rawScore)) {
    try {
      const nlp = row.nlpJson ? (JSON.parse(row.nlpJson) as NlpResult) : null;
      const competitorScores = nlp?.competitorScores ?? [];
      if (competitorScores.length > 0) {
        await evaluateScoreXp(id, row.ownerId, body.rawScore, competitorScores);
      }
    } catch {
      // best-effort : un échec d'XP n'impacte pas la sauvegarde du brief.
    }
  }

  return NextResponse.json({ ok: true });
}
