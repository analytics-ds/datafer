/**
 * Proximité sémantique des paragraphes de l'éditeur vs le centroïde top 10.
 *
 * Partagé par les trois portes d'entrée de l'éditeur : la session consultant
 * (/api/v2/briefs/[id]/semantic-paragraph) et les deux liens de partage client
 * (/api/share/[token]/briefs/[id]/semantic, /api/share-brief/[token]/semantic).
 * Avant (2026-09-30), seule la session consultant y avait accès : la vue client
 * scorait sans le critère sémantique et affichait un autre chiffre que le
 * consultant, puis l'écrivait en base.
 *
 * Les paragraphes arrivent en un seul lot (un appel bge-m3 par tranche de
 * BATCH), et non plus cinq par cinq : c'est ce goutte-à-goutte qui faisait
 * grimper le score par paliers plusieurs secondes après l'arrêt de la frappe.
 */
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cosineSim, type NlpResult } from "@/lib/analysis";

// Seuils couleur validés Pierre 2026-05-06 (cf. project_datafer_next_steps.md).
const GREEN_THRESHOLD = 0.75;
const YELLOW_THRESHOLD = 0.55;
// Cap dur par paragraphe : sur Workers AI, chaque appel bge-m3 consomme des
// neurons proportionnels à la longueur de l'input. Review 2026-05-08 (H3).
const MAX_PARAGRAPH_CHARS = 2000;
// Cap par requête : un brief très long dépasse rarement 60 blocs de 5 mots.
const MAX_PARAGRAPHS = 120;
const BATCH = 40;

export type ParagraphSemantic = { score: number; color: "green" | "yellow" | "red" } | null;

function colorFor(score: number): "green" | "yellow" | "red" {
  if (score >= GREEN_THRESHOLD) return "green";
  if (score >= YELLOW_THRESHOLD) return "yellow";
  return "red";
}

/**
 * Traite le corps `{ paragraphs: string[] }` (ou l'ancien `{ paragraph }`)
 * pour le brief dont on a déjà vérifié l'accès. Renvoie :
 *   { centroidAvailable: true, scores: (ParagraphSemantic)[] }  même ordre que l'entrée
 *   { centroidAvailable: false }  brief antérieur à l'iter sémantique
 * L'ancien format mono-paragraphe renvoie aussi `score` et `color` au premier niveau.
 */
export async function handleSemanticRequest(req: Request, nlpJson: string | null): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { paragraph?: string; paragraphs?: string[] } | null;
  const single = typeof body?.paragraph === "string";
  const input = single ? [body!.paragraph!] : Array.isArray(body?.paragraphs) ? body!.paragraphs! : null;
  if (!input) return NextResponse.json({ error: "paragraphs required" }, { status: 400 });
  if (input.length > MAX_PARAGRAPHS) {
    return NextResponse.json({ error: `too many paragraphs (max ${MAX_PARAGRAPHS})` }, { status: 400 });
  }
  const paragraphs = input.map((p) => (typeof p === "string" ? p.trim().slice(0, MAX_PARAGRAPH_CHARS) : ""));
  if (single && paragraphs[0].split(/\s+/).filter(Boolean).length < 5) {
    return NextResponse.json({ error: "paragraph too short" }, { status: 400 });
  }

  let nlp: NlpResult | null = null;
  try {
    nlp = nlpJson ? (JSON.parse(nlpJson) as NlpResult) : null;
  } catch {
    nlp = null;
  }
  const centroid = nlp?.semanticCentroid;
  if (!centroid || centroid.length === 0) {
    return NextResponse.json({ centroidAvailable: false });
  }

  const ai = (getCloudflareContext().env as unknown as { AI?: Ai }).AI;
  if (!ai) return NextResponse.json({ error: "AI binding missing" }, { status: 503 });

  const scores: ParagraphSemantic[] = paragraphs.map(() => null);
  const todo = paragraphs
    .map((text, i) => ({ text, i }))
    .filter((p) => p.text.split(/\s+/).filter(Boolean).length >= 5);
  try {
    for (let start = 0; start < todo.length; start += BATCH) {
      const chunk = todo.slice(start, start + BATCH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = (await ai.run("@cf/baai/bge-m3" as any, { text: chunk.map((c) => c.text) })) as {
        data?: number[][];
      };
      chunk.forEach((c, k) => {
        const emb = r.data?.[k];
        if (!emb || emb.length !== centroid.length) return;
        const score = Math.round(cosineSim(emb, centroid) * 1000) / 1000;
        scores[c.i] = { score, color: colorFor(score) };
      });
    }
  } catch (err) {
    console.error("[semantic-paragraphs] embed failed:", err);
    return NextResponse.json({ error: "embedding failed" }, { status: 500 });
  }

  if (single) {
    const s = scores[0];
    if (!s) return NextResponse.json({ error: "embedding failed" }, { status: 500 });
    return NextResponse.json({ centroidAvailable: true, score: s.score, color: s.color, scores });
  }
  return NextResponse.json({ centroidAvailable: true, scores });
}
