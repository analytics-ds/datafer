/**
 * POST /api/v2/briefs/[id]/semantic-paragraph
 *
 * Body : { paragraph: string }
 *
 * Embed le paragraphe via bge-m3 et calcule le cosinus vs le centroïde
 * sémantique top 10 stocké dans nlp.semanticCentroid. Sert le live scoring
 * sémantique côté éditeur (debounce 2s, ~30-50 calls par session).
 *
 * Renvoie :
 *   { score: number 0-1, color: 'green'|'yellow'|'red', centroidAvailable: true }
 *   { centroidAvailable: false }  (brief antérieur à l'iter sémantique)
 *
 * Itération 8 (2026-05-08) : feature embedding paragraphe vs top 10 (Pierre).
 */
import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { cosineSim } from "@/lib/analysis";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

// Seuils couleur validés Pierre 2026-05-06 (cf. project_datafer_next_steps.md).
const GREEN_THRESHOLD = 0.75;
const YELLOW_THRESHOLD = 0.55;

function colorFor(score: number): "green" | "yellow" | "red" {
  if (score >= GREEN_THRESHOLD) return "green";
  if (score >= YELLOW_THRESHOLD) return "yellow";
  return "red";
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  const body = (await req.json().catch(() => null)) as { paragraph?: string } | null;
  const paragraph = body?.paragraph?.trim();
  if (!paragraph || paragraph.split(/\s+/).filter(Boolean).length < 5) {
    return NextResponse.json({ error: "paragraph too short" }, { status: 400 });
  }

  const { nlp } = loadBrief(row);
  if (!nlp?.semanticCentroid || nlp.semanticCentroid.length === 0) {
    return NextResponse.json({ centroidAvailable: false });
  }

  const env = getCloudflareContext().env as unknown as DataferEnv;
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
    console.error("[semantic-paragraph] embed failed:", err);
    return NextResponse.json({ error: "embedding failed" }, { status: 500 });
  }
}
