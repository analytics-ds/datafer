/**
 * POST /api/v2/briefs/[id]/semantic-paragraph
 *
 * Body : { paragraphs: string[] }  (l'ancien { paragraph: string } reste accepté)
 *
 * Embed les paragraphes via bge-m3 et calcule leur cosinus vs le centroïde
 * sémantique top 10 stocké dans nlp.semanticCentroid. Sert le critère
 * sémantique du score de l'éditeur, en un seul lot par pause de frappe.
 *
 * Renvoie :
 *   { centroidAvailable: true, scores: ({ score, color } | null)[] }
 *   { centroidAvailable: false }  (brief antérieur à l'iter sémantique)
 *
 * Itération 8 (2026-05-08) : feature embedding paragraphe vs top 10 (Pierre).
 * Passage en lot et logique partagée avec les liens de partage : 2026-09-30.
 */
import { authBrief, notReady } from "@/lib/api-v2";
import { handleSemanticRequest } from "@/lib/semantic-paragraphs";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  return handleSemanticRequest(req, row.nlpJson);
}
