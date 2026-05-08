import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { htmlToEditorData, computeCompetitorStats } from "@/lib/briefs-service";
import { computeDetailedScore, ensureCompetitorScores } from "@/lib/scoring";
import { geoSignalsFromHtml } from "@/lib/geo-scoring";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  const { nlp } = loadBrief(row);
  if (!nlp) {
    return NextResponse.json({ error: "nlp data unavailable" }, { status: 404 });
  }

  const editorHtml = row.editorHtml ?? "";
  const ed = htmlToEditorData(editorHtml);
  const competitorScores = ensureCompetitorScores(nlp, row.serpJson);
  const geoSignals = geoSignalsFromHtml(editorHtml);
  const breakdown = computeDetailedScore(ed, nlp, geoSignals, competitorScores);

  // Le critère sémantique paragraphe est calculé côté client (live editor)
  // car il nécessite des appels bge-m3 par paragraphe. Côté serveur on
  // n'a pas les scores → critère neutralisé. Mais l'utilisateur a sauvegardé
  // un score qui les inclut. On retourne donc :
  //   - total = brief.score (le vrai score affiché dans l'éditeur, persisté)
  //   - breakdown = recalculé sans sémantique (info pédagogique)
  // Sans persistance (`row.score == null`), on retombe sur le breakdown.
  const displayedTotal = row.score ?? breakdown.total;

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    total: displayedTotal,
    breakdownTotal: breakdown.total,
    rawTotal: breakdown.rawTotal,
    competitorMedian: breakdown.competitorMedian,
    seoTotal: breakdown.seoTotal,
    geoTotal: breakdown.geoTotal,
    breakdown: {
      keyword: breakdown.keyword,
      nlpCoverage: breakdown.nlpCoverage,
      contentLength: breakdown.contentLength,
      headings: breakdown.headings,
      placement: breakdown.placement,
      structure: breakdown.structure,
      quality: breakdown.quality,
      images: breakdown.images,
      geo: breakdown.geo,
    },
    competitors: computeCompetitorStats(row.serpJson),
    editorWordCount: ed.text ? ed.text.split(/\s+/).filter(Boolean).length : 0,
  });
}
