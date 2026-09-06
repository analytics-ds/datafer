import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { computeCompetitorStats } from "@/lib/briefs-service";
import {
  CONTENT_CAP_CHARS,
  CONTENT_MODES,
  competitorContent,
  parseContentMode,
} from "@/lib/competitor-content";

export const dynamic = "force-dynamic";

/**
 * Liste des 10 concurrents du top 10.
 *
 * Query params :
 *   - content : none (défaut) | text | html | markdown | all
 *       Joint le contenu crawlé de CHAQUE concurrent à la réponse, ce qui
 *       évite les 10 appels unitaires à /competitors/{n}. Alias : `md`,
 *       `structuredHtml`, `1`/`true` (= all).
 *   - position : filtre sur une ou plusieurs positions (ex. `1,2,5`), utile
 *       pour ne tirer le contenu que des concurrents qui intéressent.
 *
 * Sans `content`, chaque concurrent porte quand même `hasContent`, `chars` et
 * `truncated` : de quoi décider quoi retélécharger sans payer le payload.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const url = new URL(req.url);
  const mode = parseContentMode(url.searchParams.get("content"));
  if (!mode) {
    return NextResponse.json(
      { error: `content must be one of ${CONTENT_MODES.join(", ")}` },
      { status: 400 },
    );
  }

  const positionsParam = url.searchParams.get("position");
  let positions: number[] | null = null;
  if (positionsParam) {
    positions = positionsParam
      .split(",")
      .map((p) => Number.parseInt(p.trim(), 10))
      .filter((p) => Number.isFinite(p) && p >= 1);
    if (positions.length === 0) {
      return NextResponse.json(
        { error: "position must be a comma-separated list of positions, e.g. 1,2,5" },
        { status: 400 },
      );
    }
  }

  const pending = notReady(row);
  if (pending) return pending;

  const { serp } = loadBrief(row);
  const stats = computeCompetitorStats(row.serpJson);

  const selected = positions
    ? serp.filter((r) => positions.includes(r.position))
    : serp;

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    stats,
    // Rappel du cap de persistance côté client, pour interpréter `truncated`.
    contentCapChars: CONTENT_CAP_CHARS,
    competitors: selected.map((r) => ({
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
      ...competitorContent(r, mode),
    })),
  });
}
