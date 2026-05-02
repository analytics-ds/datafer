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

  const { serp } = loadBrief(row);
  const stats = computeCompetitorStats(row.serpJson);

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    stats,
    competitors: serp.map((r) => ({
      position: r.position,
      title: r.title,
      link: r.link,
      displayed_link: r.displayed_link,
      snippet: r.snippet,
      wordCount: r.wordCount ?? null,
      headings: r.headings ?? null,
      paragraphs: r.paragraphs ?? null,
      h1: r.h1 ?? [],
      h2: r.h2 ?? [],
      h3: r.h3 ?? [],
      outline: r.outline ?? [],
      score: r.score ?? null,
      hasContent: typeof r.text === "string" && r.text.length > 0,
    })),
  });
}
