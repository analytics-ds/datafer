// POST /api/share-brief/[token]/semantic-paragraph
// Variante publique du endpoint semantic-paragraph : lookup par shareToken
// au lieu de session auth. Aucune écriture, donc safe à exposer sans auth,
// comme la route maillage voisine.
//
// Sans elle, le critère « Sémantique Google » (15 points) n'était calculé
// que pour un lecteur authentifié. En vue client il restait neutralisé et
// sortait de la renormalisation : le même brief affichait un score plus
// haut au client qu'au consultant. Cf. src/lib/scoring.ts, commentaire de
// computeDetailedScore sur la neutralisation à max=0.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { cosineSim } from "@/lib/analysis";
import type { NlpResult } from "@/lib/analysis";
import type { CorpusEnv } from "@/lib/corpus-env";

export const dynamic = "force-dynamic";

// Mêmes seuils que la route authentifiée, à garder synchronisés.
const GREEN_THRESHOLD = 0.75;
const YELLOW_THRESHOLD = 0.55;

function colorFor(score: number): "green" | "yellow" | "red" {
  if (score >= GREEN_THRESHOLD) return "green";
  if (score >= YELLOW_THRESHOLD) return "yellow";
  return "red";
}

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const body = (await req.json().catch(() => null)) as { paragraph?: string } | null;
  const paragraph = body?.paragraph?.trim();
  if (!paragraph || paragraph.split(/\s+/).filter(Boolean).length < 5) {
    return NextResponse.json({ error: "paragraph too short" }, { status: 400 });
  }
  // Même cap que la route authentifiée : au-delà, un paragraphe long vide
  // le quota Workers AI (neurons proportionnels à la longueur de l'input).
  if (paragraph.length > 2000) {
    return NextResponse.json(
      { error: "paragraph too long (max 2000 characters)" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [row] = await db
    .select({ nlpJson: brief.nlpJson })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const nlp = row.nlpJson ? (JSON.parse(row.nlpJson) as NlpResult) : null;
  if (!nlp?.semanticCentroid || nlp.semanticCentroid.length === 0) {
    return NextResponse.json({ centroidAvailable: false });
  }

  const env = getCloudflareContext().env as unknown as CorpusEnv;
  const ai = (env as unknown as { AI?: Ai }).AI;
  if (!ai) {
    return NextResponse.json({ error: "AI binding missing" }, { status: 503 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (await ai.run("@cf/baai/bge-m3" as any, { text: [paragraph] })) as {
      data?: number[][];
    };
    const emb = r.data?.[0];
    if (!emb || emb.length !== nlp.semanticCentroid.length) {
      return NextResponse.json({ error: "embedding failed" }, { status: 500 });
    }
    const score = cosineSim(emb, nlp.semanticCentroid);
    return NextResponse.json({
      centroidAvailable: true,
      score: Math.round(score * 1000) / 1000,
      color: colorFor(score),
    });
  } catch (err) {
    console.error("[share semantic-paragraph] embed failed:", err);
    return NextResponse.json({ error: "embedding failed" }, { status: 500 });
  }
}
