import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { htmlToEditorData, computeCompetitorStats } from "@/lib/briefs-service";
import {
  computeDetailedScore,
  ensureAvgBlocks,
  kwEmphasizedFromHtml,
} from "@/lib/scoring";
import { geoSignalsFromHtml } from "@/lib/geo-scoring";
import { scoreParagraphsAgainstCentroid } from "@/lib/semantic-paragraphs";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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
  const geoSignals = geoSignalsFromHtml(editorHtml);
  // Référence de structure pour les briefs analysés avant avgBlocks.
  ensureAvgBlocks(nlp, row.serpJson);
  // Sémantique et saillance calculées ici aussi (2026-09-06) : ce breakdown
  // était auparavant recalculé sans elles, donc il ne pouvait pas coïncider
  // avec le score persisté et une note expliquait l'écart. Les deux sont
  // désormais calculables côté serveur, le breakdown est donc complet.
  const kwEmphasized = kwEmphasizedFromHtml(editorHtml, nlp.exactKeyword?.keyword ?? "");
  const ai = (getCloudflareContext().env as unknown as { AI?: Ai }).AI;
  const semanticScores = await scoreParagraphsAgainstCentroid(
    editorHtml,
    nlp.semanticCentroid,
    ai,
  );
  // Score brut (rawTotal) directement, plus de relativisation vs médiane
  // concurrents (décision 2026-05-16 : aligner user vs SERP sur même échelle).
  const breakdown = computeDetailedScore(
    { ...ed, kwEmphasized },
    nlp,
    geoSignals,
    undefined,
    semanticScores ?? undefined,
  );

  // `total` reste le score persisté quand il existe (c'est celui qu'affichent
  // la liste et l'éditeur) ; `breakdownTotal` est le recalcul de cette
  // requête. Les deux doivent maintenant coïncider, un écart signale un
  // score persisté par une formule antérieure.
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
      differentiation: breakdown.differentiation,
      contentLength: breakdown.contentLength,
      headings: breakdown.headings,
      placement: breakdown.placement,
      structure: breakdown.structure,
      quality: breakdown.quality,
      images: breakdown.images,
      semantic: breakdown.semantic,
      salience: breakdown.salience,
      geo: breakdown.geo,
    },
    competitors: computeCompetitorStats(row.serpJson),
    editorWordCount: ed.text ? ed.text.split(/\s+/).filter(Boolean).length : 0,
  });
}
