import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { computeCompetitorStats } from "@/lib/briefs-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  const { nlp } = loadBrief(row);
  const competitors = computeCompetitorStats(row.serpJson);

  return NextResponse.json({
    id: row.id,
    status: "ready",
    keyword: row.keyword,
    country: row.country,
    score: row.score,
    intent: nlp?.intent ?? null,
    targetWordCount: nlp?.avgWordCount ?? null,
    minWordCount: nlp?.minWordCount ?? null,
    maxWordCount: nlp?.maxWordCount ?? null,
    avgHeadings: nlp?.avgHeadings ?? null,
    avgParagraphs: nlp?.avgParagraphs ?? null,
    competitors,
    position: row.position,
    volume: row.volume,
    cpc: row.cpc,
    competition: row.competition,
    kgr: row.kgr,
    allintitleCount: row.allintitleCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
