/**
 * Score serveur d'un contenu, identique à celui de l'éditeur.
 *
 * Une seule fonction pour tous les chemins serveur qui scorent le contenu
 * rédigé : `POST /api/v1/briefs/{id}/content`, `GET /api/v2/briefs/{id}/scoring`
 * et le score initial d'un brief créé avec « Mon URL ». Elle lit le HTML comme
 * l'éditeur (editor-html.ts) et calcule la proximité sémantique des mêmes
 * paragraphes avec le même modèle et le même arrondi que la route appelée par
 * l'éditeur. Un contenu a donc le même score qu'il passe par l'API ou par
 * l'éditeur, côté consultant comme côté client (2026-09-30).
 */
import { cosineSim, type NlpResult } from "@/lib/analysis";
import { computeDetailedScore, type DetailedScore, type ParagraphSemanticScore } from "@/lib/scoring";
import { readEditorHtml } from "@/lib/editor-html";

// Cap dur par paragraphe : sur Workers AI, chaque appel bge-m3 consomme des
// neurons proportionnels à la longueur de l'input. Review 2026-05-08 (H3).
export const MAX_PARAGRAPH_CHARS = 2000;
const BATCH = 40;

/**
 * Cosinus de chaque paragraphe vs le centroïde top 10, arrondi au millième
 * (même valeur que celle que reçoit l'éditeur). null pour un paragraphe de
 * moins de 5 mots ou un embedding inexploitable. Lève si Workers AI échoue.
 */
export async function embedParagraphScores(
  ai: Ai,
  centroid: number[],
  paragraphs: string[],
): Promise<(number | null)[]> {
  const texts = paragraphs.map((p) => p.trim().slice(0, MAX_PARAGRAPH_CHARS));
  const scores: (number | null)[] = texts.map(() => null);
  const todo = texts
    .map((text, i) => ({ text, i }))
    .filter((p) => p.text.split(/\s+/).filter(Boolean).length >= 5);
  for (let start = 0; start < todo.length; start += BATCH) {
    const chunk = todo.slice(start, start + BATCH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (await ai.run("@cf/baai/bge-m3" as any, { text: chunk.map((c) => c.text) })) as {
      data?: number[][];
    };
    chunk.forEach((c, k) => {
      const emb = r.data?.[k];
      if (!emb || emb.length !== centroid.length) return;
      scores[c.i] = Math.round(cosineSim(emb, centroid) * 1000) / 1000;
    });
  }
  return scores;
}

export type EditorScoreOptions = {
  /** Binding Workers AI. Sans lui, le critère sémantique est neutralisé. */
  ai?: Ai;
  /**
   * true : un échec de Workers AI fait lever l'erreur plutôt que de rendre un
   * score sans sémantique (qui serait faux et partirait en base). C'est le
   * comportement de l'éditeur, qui garde alors l'ancien score.
   */
  strictSemantic?: boolean;
};

export async function scoreEditorHtml(
  html: string,
  nlp: NlpResult | null,
  opts: EditorScoreOptions = {},
): Promise<DetailedScore & { wordCount: number }> {
  const reading = readEditorHtml(html, nlp?.exactKeyword?.keyword ?? "");
  let semantic: ParagraphSemanticScore[] | undefined;
  const centroid = nlp?.semanticCentroid;
  if (opts.ai && centroid && centroid.length > 0 && reading.semanticParagraphs.length > 0) {
    try {
      const scores = await embedParagraphScores(opts.ai, centroid, reading.semanticParagraphs);
      const ok = scores.filter((s): s is number => s !== null).map((score) => ({ score }));
      semantic = ok.length > 0 ? ok : undefined;
    } catch (err) {
      if (opts.strictSemantic) throw err;
      console.error("[editor-score] embeddings indisponibles, score sans sémantique", err);
    }
  }
  const breakdown = computeDetailedScore(reading.editorData, nlp, reading.geoSignals, undefined, semantic);
  const text = reading.editorData.text;
  return { ...breakdown, wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0 };
}
