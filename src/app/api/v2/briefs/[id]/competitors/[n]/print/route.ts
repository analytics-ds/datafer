import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { renderPrintDocument } from "@/lib/export-content";

export const dynamic = "force-dynamic";

/**
 * Page HTML autonome (hors layout Next) qui auto-déclenche le print dialog
 * du navigateur. L'utilisateur choisit "Enregistrer en PDF" pour générer
 * le PDF. Même technique que pour l'export d'un brief rédigé.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await context.params;
  const position = Number.parseInt(n, 10);
  if (!Number.isFinite(position) || position < 1) {
    return NextResponse.json({ error: "invalid position" }, { status: 400 });
  }

  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  const { serp } = loadBrief(row);
  const competitor = serp.find((r) => r.position === position);
  if (!competitor) {
    return NextResponse.json({ error: "competitor not found at position" }, { status: 404 });
  }
  const bodyHtml = competitor.structuredHtml ?? "";
  if (!bodyHtml) {
    return NextResponse.json(
      { error: "competitor content not available (brief created before content persistence)" },
      { status: 404 },
    );
  }

  let host = "";
  try {
    host = new URL(competitor.link).hostname.replace(/^www\./, "");
  } catch {}
  const title = `${competitor.title || competitor.link} — Position ${position} (${host}) — ${row.keyword}`;

  return new Response(renderPrintDocument(title, bodyHtml), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
