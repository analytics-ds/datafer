// GET /api/v2/briefs/{id}/competitors/{n}/content?format=text|html|markdown
//
// Le contenu d'un concurrent, brut, sans enveloppe JSON : ce qu'on veut quand
// on pipe dans un fichier ou dans un LLM (`curl … > concurrent-3.md`). La
// version JSON reste sur /competitors/{n}, la version fichier téléchargeable
// (Content-Disposition, docx) sur /competitors/{n}/download.

import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { FORMATS, parseFormat, renderCompetitorAs } from "@/lib/competitor-content";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  text: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
};

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; n: string }> },
) {
  const { id, n } = await context.params;
  const position = Number.parseInt(n, 10);
  if (!Number.isFinite(position) || position < 1) {
    return NextResponse.json({ error: "invalid position" }, { status: 400 });
  }

  const url = new URL(req.url);
  // Markdown par défaut : c'est le format le plus utile pour relire un
  // contenu concurrent ou l'envoyer à un modèle.
  const format = parseFormat(url.searchParams.get("format") ?? "markdown");
  if (!format) {
    return NextResponse.json(
      { error: `format must be one of ${FORMATS.join(", ")}` },
      { status: 400 },
    );
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

  const body = renderCompetitorAs(competitor, format);
  if (!body) {
    return NextResponse.json(
      { error: "competitor content not available (brief created before content persistence)" },
      { status: 404 },
    );
  }

  return new Response(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      // De quoi savoir de quelle page vient le contenu sans second appel.
      "X-Competitor-Url": competitor.link,
      "X-Competitor-Position": String(competitor.position),
    },
  });
}
