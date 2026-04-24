import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resolveUser } from "@/lib/api-auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import type { NlpResult } from "@/lib/analysis";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(_req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const [row] = await db
    .select({
      id: brief.id,
      keyword: brief.keyword,
      country: brief.country,
      score: brief.score,
      editorHtml: brief.editorHtml,
      nlpJson: brief.nlpJson,
      volume: brief.volume,
      position: brief.position,
      createdAt: brief.createdAt,
      updatedAt: brief.updatedAt,
    })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const nlp = row.nlpJson ? (JSON.parse(row.nlpJson) as NlpResult) : null;
  const targetTerms = nlp?.nlpTerms?.slice(0, 50).map((t) => ({
    term: t.term,
    avgCount: t.avgCount,
    presence: t.presence,
  })) ?? [];

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    country: row.country,
    score: row.score,
    volume: row.volume,
    position: row.position,
    editorHtml: row.editorHtml ?? "",
    targetTerms,
    targetWordCount: nlp?.avgWordCount ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
