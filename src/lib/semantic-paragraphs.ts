/**
 * Scoring sémantique des paragraphes du contenu rédigé, côté serveur.
 *
 * Jusqu'au 2026-09-06, seul l'éditeur alimentait ce critère : il appelait
 * `/api/v2/briefs/{id}/semantic-paragraph` par paragraphe et passait les
 * cosinus à `computeDetailedScore`. Le scoring serveur (`rescoreBrief`,
 * derrière `POST /api/v1/briefs/{id}/content`) n'avait pas ces scores, donc
 * il neutralisait le critère : le même HTML sortait à 82 par l'API et 83 dans
 * l'éditeur, 79 quand le cosinus moyen tombait à 0,60. Et comme les deux
 * chemins écrivent dans la même colonne `brief.score`, la valeur affichée
 * dépendait de qui avait écrit en dernier.
 *
 * Ce module donne au serveur le même calcul, sur les mêmes blocs que
 * l'éditeur (p / ul / ol, au moins 5 mots).
 */

import { cosineSim } from "@/lib/analysis";
import type { ParagraphSemanticScore } from "@/lib/scoring";

/** Même seuil que l'éditeur : sous 5 mots, un bloc n'a pas de sens à embedder. */
const MIN_WORDS = 5;

/**
 * Cap par paragraphe, aligné sur `computeSemanticCentroid` : au-delà, on
 * dépasse le context window bge-m3 et le batch entier saute (cf. le PDF
 * universitaire de « intelligenza artificiale hr », 2026-05-28).
 */
const MAX_PARAGRAPH_CHARS = 1500;

/** Même batch que le centroïde : 25 × 1500 chars reste sous les 60k tokens. */
const BATCH_SIZE = 25;

/**
 * Garde-fou de consommation Workers AI : un rescore ne doit pas embedder un
 * contenu de 200 blocs. Au-delà, on garde les premiers blocs, qui portent
 * l'essentiel du sujet.
 */
const MAX_PARAGRAPHS = 40;

/**
 * Blocs à scorer dans le HTML rédigé : paragraphes et listes, comme
 * l'éditeur. Une liste est embeddée en entier (l'agrégat de ses `<li>`) et
 * non puce par puce : un bullet isolé n'a pas assez de contexte (arbitrage
 * Pierre 2026-05-28).
 */
export function extractScorableParagraphs(html: string): string[] {
  const blocks = html.match(/<(p|ul|ol)[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  const out: string[] = [];
  for (const b of blocks) {
    const text = b
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.split(/\s+/).filter(Boolean).length < MIN_WORDS) continue;
    out.push(text.length > MAX_PARAGRAPH_CHARS ? text.slice(0, MAX_PARAGRAPH_CHARS) : text);
  }
  return out;
}

/**
 * Cosinus de chaque paragraphe vs le centroïde du top 10.
 *
 * Renvoie `null` quand le critère ne peut pas être calculé (pas de centroïde,
 * pas de binding AI, aucun paragraphe scorable, ou tous les batches en
 * échec) : l'appelant neutralise alors le critère au lieu d'inventer une
 * valeur. Un batch en échec n'annule pas les précédents, comme dans
 * `computeSemanticCentroid`.
 */
export async function scoreParagraphsAgainstCentroid(
  html: string,
  centroid: number[] | undefined | null,
  ai: Ai | undefined,
): Promise<ParagraphSemanticScore[] | null> {
  if (!ai || !centroid || centroid.length === 0) return null;
  const paragraphs = extractScorableParagraphs(html).slice(0, MAX_PARAGRAPHS);
  if (paragraphs.length === 0) return null;

  const scores: ParagraphSemanticScore[] = [];
  for (let i = 0; i < paragraphs.length; i += BATCH_SIZE) {
    const batch = paragraphs.slice(i, i + BATCH_SIZE);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await ai.run("@cf/baai/bge-m3" as any, { text: batch })) as {
        data?: number[][];
      };
      if (!res.data || res.data.length !== batch.length) {
        console.warn(
          `[semantic] batch mismatch: ${res.data?.length} vs ${batch.length}`,
        );
        continue;
      }
      for (const emb of res.data) {
        if (!emb || emb.length !== centroid.length) continue;
        scores.push({ score: cosineSim(emb, centroid) });
      }
    } catch (err) {
      console.error("[semantic] embed batch failed:", err);
    }
  }

  return scores.length > 0 ? scores : null;
}
