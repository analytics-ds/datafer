import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { htmlToEditorData, computeCompetitorStats } from "@/lib/briefs-service";
import { computeDetailedScore } from "@/lib/scoring";

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
  const breakdown = computeDetailedScore(ed, nlp);

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    total: breakdown.total,
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
      geo: breakdown.geo,
    },
    competitors: computeCompetitorStats(row.serpJson),
    editorWordCount: ed.text ? ed.text.split(/\s+/).filter(Boolean).length : 0,
  });
}
