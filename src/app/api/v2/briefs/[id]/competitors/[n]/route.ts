import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    competitor: {
      position: competitor.position,
      title: competitor.title,
      link: competitor.link,
      displayed_link: competitor.displayed_link,
      snippet: competitor.snippet,
      wordCount: competitor.wordCount ?? null,
      headings: competitor.headings ?? null,
      paragraphs: competitor.paragraphs ?? null,
      h1: competitor.h1 ?? [],
      h2: competitor.h2 ?? [],
      h3: competitor.h3 ?? [],
      outline: competitor.outline ?? [],
      score: competitor.score ?? null,
      // Champs lourds : disponibles uniquement pour les briefs créés après
      // l'introduction de la persistance contenu (V2). null pour les briefs
      // antérieurs.
      text: competitor.text ?? null,
      structuredHtml: competitor.structuredHtml ?? null,
    },
  });
}
