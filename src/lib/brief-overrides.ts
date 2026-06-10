import type { NlpResult, SerpResult } from "@/lib/analysis";

/**
 * Overrides back-office sur les data d'analyse du brief. Edités via la modal
 * "Paramètres du brief" (icône ⚙️ dans le header). Persisté dans la colonne
 * `brief.overrides_json`. Appliqué côté serveur au chargement, avant le
 * scoring et l'affichage. La data brute SERP/Haloscan reste intacte dans les
 * autres colonnes : on peut toujours revenir à l'analyse d'origine en
 * vidant l'objet d'overrides.
 */
export type BriefOverrides = {
  position?: number | null;
  wordCount?: {
    min?: number;
    max?: number;
    avg?: number;
  };
  // URLs des concurrents top 10 à retirer du calcul (médiane, benchmarks,
  // affichage SERP). Le centroïde sémantique paragraphe reste calculé sur
  // l'ensemble du top 10 (embeddings non stockés par concurrent).
  disabledCompetitors?: string[];
  // Termes NLP à retirer (par .term). Utile quand l'analyse remonte du bruit
  // ("cookie", "newsletter") qui n'a rien à voir avec le sujet du KW.
  nlpTermsRemoved?: string[];
  // Termes NLP custom : ajoutés manuellement par le consultant (modal
  // Paramètres) ou seedés à la création depuis les mots-clés secondaires.
  // Injectés avec presence=70 (tier Essentiels, seuil >= 70) pour entrer
  // dans le scoring de couverture. avgCount/minCount/maxCount à 1.
  nlpTermsAdded?: string[];
};

export function parseBriefOverrides(json: string | null | undefined): BriefOverrides {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as BriefOverrides) : {};
  } catch {
    return {};
  }
}

/**
 * Applique les overrides aux data brutes du brief. Retourne une copie
 * modifiée (immutabilité). Si overrides est vide / null, retourne les data
 * d'origine sans copie.
 *
 * - `position` : remplacement direct
 * - `wordCount.{min,max,avg}` : remplacement champ par champ sur le NlpResult
 * - `disabledCompetitors` : filtre serp[] sur url. On invalide
 *   `nlp.competitorScores` pour forcer un re-scoring sur les concurrents
 *   restants (médiane + score relatif recalculés).
 * - `nlpTermsRemoved` : filtre nlp.nlpTerms
 */
export function applyBriefOverrides(
  data: { nlp: NlpResult | null; serp: SerpResult[]; position: number | null },
  overrides: BriefOverrides,
): { nlp: NlpResult | null; serp: SerpResult[]; position: number | null } {
  if (!overrides || Object.keys(overrides).length === 0) return data;

  let serp = data.serp;
  if (overrides.disabledCompetitors && overrides.disabledCompetitors.length > 0) {
    const disabled = new Set(overrides.disabledCompetitors);
    serp = data.serp.filter((s) => !disabled.has(s.link));
  }

  const position =
    overrides.position !== undefined ? overrides.position : data.position;

  let nlp = data.nlp;
  if (nlp) {
    const next: NlpResult = { ...nlp };

    if (overrides.nlpTermsRemoved && overrides.nlpTermsRemoved.length > 0) {
      const removed = new Set(overrides.nlpTermsRemoved);
      next.nlpTerms = nlp.nlpTerms.filter((t) => !removed.has(t.term));
    }

    if (overrides.nlpTermsAdded && overrides.nlpTermsAdded.length > 0) {
      const existing = new Set(next.nlpTerms.map((t) => t.term.toLowerCase()));
      // Termes ajoutés avec metadata par défaut : presence=70 (tier Essentiels),
      // avgCount/minCount/maxCount=1. Pas de dédoublonnage côté display si
      // l'utilisateur ré-ajoute un terme déjà présent (filtre côté lower).
      const customs = overrides.nlpTermsAdded
        .filter((term) => term && !existing.has(term.toLowerCase()))
        .map((term) => ({
          term,
          score: 0,
          presence: 70,
          df: 1,
          inHeadings: false,
          minCount: 1,
          maxCount: 1,
          avgCount: 1,
        }));
      // PREPEND, pas append : l'UI et le scoring ne regardent que les 40
      // premiers termes (slice(0, 40)) alors que runNLP en retourne jusqu'à
      // 60. Un terme custom appendé en fin de liste était invisible et non
      // scoré dès que l'analyse remontait 40+ termes naturels. En tête, les
      // termes voulus par l'utilisateur sont toujours affichés et comptés.
      next.nlpTerms = [...customs, ...next.nlpTerms];
    }

    if (overrides.wordCount) {
      if (typeof overrides.wordCount.min === "number") {
        next.minWordCount = overrides.wordCount.min;
      }
      if (typeof overrides.wordCount.max === "number") {
        next.maxWordCount = overrides.wordCount.max;
      }
      if (typeof overrides.wordCount.avg === "number") {
        next.avgWordCount = overrides.wordCount.avg;
      }
    }

    // Si on a retiré des concurrents, le tableau competitorScores caché
    // dans nlp_json est obsolète : on l'invalide pour que le prochain
    // computeDetailedScore (via ensureCompetitorScores) re-score sur le
    // serp filtré. competitorSemanticScores reste tel quel (centroïde
    // bge-m3 figé à la création).
    if (overrides.disabledCompetitors && overrides.disabledCompetitors.length > 0) {
      next.competitorScores = undefined;
    }

    nlp = next;
  }

  return { nlp, serp, position };
}
