import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resolveUser, type AuthedUser } from "@/lib/api-auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import type { NlpResult, SerpResult, Paa } from "@/lib/analysis";

export type BriefRow = {
  id: string;
  ownerId: string;
  status: "pending" | "ready" | "failed";
  errorMessage: string | null;
  keyword: string;
  country: string;
  score: number | null;
  editorHtml: string | null;
  serpJson: string | null;
  nlpJson: string | null;
  haloscanJson: string | null;
  paaJson: string | null;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  kgr: number | null;
  allintitleCount: number | null;
  position: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LoadedBrief = {
  row: BriefRow;
  serp: SerpResult[];
  nlp: NlpResult | null;
  paa: Paa[];
  haloscan: Record<string, unknown> | null;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function authBrief(
  req: Request,
  id: string,
): Promise<{ ok: true; user: AuthedUser; row: BriefRow } | { ok: false; response: NextResponse }> {
  const user = await resolveUser(req);
  if (!user) return { ok: false, response: jsonError("unauthorized", 401) };

  const db = getDb();
  const [row] = await db
    .select({
      id: brief.id,
      ownerId: brief.ownerId,
      status: brief.status,
      errorMessage: brief.errorMessage,
      keyword: brief.keyword,
      country: brief.country,
      score: brief.score,
      editorHtml: brief.editorHtml,
      serpJson: brief.serpJson,
      nlpJson: brief.nlpJson,
      haloscanJson: brief.haloscanJson,
      paaJson: brief.paaJson,
      volume: brief.volume,
      cpc: brief.cpc,
      competition: brief.competition,
      kgr: brief.kgr,
      allintitleCount: brief.allintitleCount,
      position: brief.position,
      createdAt: brief.createdAt,
      updatedAt: brief.updatedAt,
    })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);

  if (!row) return { ok: false, response: jsonError("not found", 404) };
  return { ok: true, user, row: row as BriefRow };
}

export function loadBrief(row: BriefRow): LoadedBrief {
  return {
    row,
    serp: safeParse<SerpResult[]>(row.serpJson) ?? [],
    nlp: safeParse<NlpResult>(row.nlpJson),
    paa: safeParse<Paa[]>(row.paaJson) ?? [],
    haloscan: safeParse<Record<string, unknown>>(row.haloscanJson),
  };
}

// Petite réponse standard pour les briefs pas encore prêts ou en erreur. Tous
// les endpoints V2 partagent ce comportement : si l'analyse n'est pas terminée
// on renvoie le statut, sans corps métier.
export function notReady(row: BriefRow): NextResponse | null {
  if (row.status === "pending") {
    return NextResponse.json({
      id: row.id,
      status: "pending",
      keyword: row.keyword,
      country: row.country,
      message: "brief pas encore prêt, analyse en cours",
      createdAt: row.createdAt,
    });
  }
  if (row.status === "failed") {
    return NextResponse.json(
      {
        id: row.id,
        status: "failed",
        keyword: row.keyword,
        country: row.country,
        error: row.errorMessage ?? "analysis failed",
        createdAt: row.createdAt,
      },
      { status: 200 },
    );
  }
  return null;
}
