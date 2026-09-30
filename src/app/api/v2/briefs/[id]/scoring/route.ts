import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { computeCompetitorStats } from "@/lib/briefs-service";
import { applyBriefOverrides, parseBriefOverrides } from "@/lib/brief-overrides";
import { scoreEditorHtml } from "@/lib/editor-score";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  const { nlp, serp } = loadBrief(row);
  if (!nlp) {
    return NextResponse.json({ error: "nlp data unavailable" }, { status: 404 });
  }

  // Même NLP (overrides du brief) et même calcul que l'éditeur, sémantique et
  // saillance comprises (editor-score.ts, 2026-09-30) : le détail renvoyé est
  // celui du score affiché partout. Avant, ce détail était recalculé sans
  // sémantique ni overrides et ne retombait pas sur le total.
  const overridden = applyBriefOverrides(
    { nlp, serp, position: null },
    parseBriefOverrides(row.overridesJson),
  );
  const ai = (getCloudflareContext().env as unknown as { AI?: Ai }).AI;
  let breakdown;
  try {
    breakdown = await scoreEditorHtml(row.editorHtml ?? "", overridden.nlp ?? nlp, { ai, strictSemantic: true });
  } catch {
    return NextResponse.json({ error: "semantic scoring unavailable, retry in a few seconds" }, { status: 503 });
  }

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    total: breakdown.total,
    // Conservé pour compatibilité : c'est désormais la même valeur que total.
    breakdownTotal: breakdown.total,
    storedScore: row.score,
    rawTotal: breakdown.rawTotal,
    competitorMedian: breakdown.competitorMedian,
    seoTotal: breakdown.seoTotal,
    geoTotal: breakdown.geoTotal,
    breakdown: {
      keyword: breakdown.keyword,
      nlpCoverage: breakdown.nlpCoverage,
      differentiation: breakdown.differentiation,
      contentLength: breakdown.contentLength,
      headings: breakdown.headings,
      placement: breakdown.placement,
      structure: breakdown.structure,
      quality: breakdown.quality,
      salience: breakdown.salience,
      semantic: breakdown.semantic,
      images: breakdown.images,
      geo: breakdown.geo,
    },
    competitors: computeCompetitorStats(row.serpJson),
    editorWordCount: breakdown.wordCount,
  });
}
