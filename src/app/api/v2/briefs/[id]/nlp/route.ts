import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";

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

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    intent: nlp.intent ?? null,
    exactKeyword: nlp.exactKeyword,
    keywordTerms: nlp.keywordTerms ?? [],
    nlpTerms: nlp.nlpTerms,
    semanticClusters: nlp.semanticClusters ?? [],
    sections: nlp.sections ?? [],
    entities: nlp.entities ?? [],
    opportunities: nlp.opportunities ?? [],
    stats: {
      avgWordCount: nlp.avgWordCount,
      avgHeadings: nlp.avgHeadings,
      avgParagraphs: nlp.avgParagraphs,
      minWordCount: nlp.minWordCount,
      maxWordCount: nlp.maxWordCount,
    },
  });
}
