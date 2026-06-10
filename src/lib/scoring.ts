/**
 * Scoring /100 combinant SEO classique et GEO (Generative Engine Opt.).
 *
 * Total = 0.8 * score SEO + 0.2 * score GEO. Le SEO reste l'essentiel et
 * GEO valorise les patterns appréciés par les LLMs (table, listes, TL;DR,
 * FAQ, données chiffrées). Exécuté côté client à chaque édition.
 */
import type { NlpResult, NlpTerm, SerpResult } from "./analysis";
import { computeGeoScore, EMPTY_GEO_SIGNALS, geoSignalsFromHtml, type GeoScore, type GeoSignals } from "./geo-scoring";

// GEO pèse 8 points sur 100 (avant 5 pts, itération 2026-05-08). Le poids
// remonte légèrement parce que les top 10 réels exploitent souvent la
// structure GEO sans la nommer (listes, tableaux, FAQ, données chiffrées),
// donc l'ignorer fait perdre du discriminant entre concurrents.
const SEO_WEIGHT = 0.92;
const GEO_WEIGHT = 0.08;

// Mots non significatifs pour le matching "soft" du keyword sur les longues
// expressions ("meilleur moto cross 125 fiable" → on ne va pas exiger que
// "meilleur" et "fiable" soient écrits dans cet ordre exact, on regarde la
// présence des tokens significatifs dans le texte). Liste alignée avec
// FINGERPRINT_FILLERS d'analysis.ts.
const KW_FILLERS = new Set([
  "pour", "de", "du", "des", "à", "au", "aux", "en", "avec", "sans",
  "sur", "sous", "vers", "chez", "dans", "par", "entre", "selon",
  "le", "la", "les", "un", "une", "et", "ou", "est", "sont",
]);

/**
 * Renvoie les tokens "significatifs" du keyword (longueur >= 3 et hors
 * KW_FILLERS), normalisés. Exemple : "meilleur moto cross 125 fiable"
 * → ["meilleur", "moto", "cross", "125", "fiable"]. Sert au match "soft"
 * sur les KW longs où l'expression exacte n'apparaît jamais dans aucun
 * top SERP (cas typique : Google ranke un article qui parle du sujet,
 * pas un article qui répète la phrase du KW mot pour mot).
 */
function significantKwTokens(keyword: string): string[] {
  return normalize(keyword)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !KW_FILLERS.has(t));
}

/** Couverture des tokens significatifs du keyword dans un segment normalisé. */
function tokenCoverage(segmentNorm: string, kwTokens: string[]): number {
  if (kwTokens.length === 0) return 0;
  const present = kwTokens.filter((t) => segmentNorm.includes(t)).length;
  return present / kwTokens.length;
}

/**
 * Normalisation lowercase + suppression des diacritiques (accents).
 * Utilisée des deux côtés du matching KW pour que "moto électrique" et
 * "moto electrique" matchent la même chose. Google fait pareil en SERP.
 */
export function normalize(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // Apostrophes typographiques ET droites (ASCII) → espaces. Sans ça
      // « d'électrostimulation » bloquait le matching mot-à-mot.
      // L'apostrophe ASCII U+0027 est la plus courante dans les textes
      // saisis (clavier standard), oublier ce caractère cassait le H1 check
      // et faisait remonter des termes NLP type « lauto » au lieu de « auto ».
      .replace(/['‘’`]/g, " ")
      // Ligatures françaises → forme décomposée (fold à la Google). Sans ça
      // « œuf » et « oeuf » n'étaient pas considérés équivalents pour le
      // matching KW/H1, ce qui pénalisait les KW à ligature.
      .replace(/œ/g, "oe")
      .replace(/æ/g, "ae")
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tokens FR sans valeur sémantique isolée (interrogatifs, articles,
 * prépositions, auxiliaires). Un terme NLP composé uniquement de ces tokens
 * (et/ou des tokens du mot-clé principal) est du bruit : masqué dans la
 * sidebar ET exclu du scoring de couverture, pour que l'utilisateur ne soit
 * jamais scoré sur un terme qu'il ne peut pas voir. Particulièrement visible
 * sur la longue traîne interrogative ("comment laver un jean...") où "quelle",
 * "faut-il", "deux" remontaient en tier Essentiels (constat 2026-06-10).
 */
export const NLP_JUNK_TOKENS = new Set([
  "est", "ce", "qui", "que", "quoi", "qu", "où", "ou", "quand",
  "comment", "pourquoi", "combien",
  "quel", "quelle", "quels", "quelles",
  "quelque", "quelques", "quelconque", "quelconques",
  "lequel", "laquelle", "lesquels", "lesquelles",
  "le", "la", "les", "un", "une", "des", "du", "de", "en", "et",
  "à", "a", "au", "aux", "pour", "par", "sur", "sous", "dans", "avec", "sans",
  "plus", "moins", "très", "tres", "tout", "tous", "toute", "toutes",
  "bien", "mieux", "aussi", "encore", "déjà", "deja", "même", "meme", "non", "oui",
  "fait", "faire", "faut", "peut", "peuvent", "sont", "etre", "avoir", "il", "ils", "on",
  "deux", "trois",
  "n", "s", "d", "l", "j", "t", "m", "c",
]);

/**
 * Vrai si le terme NLP est du bruit : tous ses tokens sont soit des
 * NLP_JUNK_TOKENS, soit des tokens du mot-clé principal (variantes
 * singulier/pluriel incluses). Partagé entre la sidebar de l'éditeur et le
 * scoring nlpCoverage pour garantir que ce qui est compté = ce qui est
 * affiché.
 */
export function isJunkNlpTerm(term: string, targetKeyword?: string | null): boolean {
  // Split aussi sur les tirets : "faut-il", "est-ce", "peut-on" doivent être
  // décomposés pour matcher les tokens junk.
  const tokens = normalize(term)
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const kwTokens = new Set<string>();
  if (targetKeyword) {
    normalize(targetKeyword)
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .forEach((w) => {
        kwTokens.add(w);
        if (w.endsWith("s")) kwTokens.add(w.slice(0, -1));
        else kwTokens.add(w + "s");
      });
  }

  return tokens.every((t) => NLP_JUNK_TOKENS.has(t) || kwTokens.has(t));
}

/**
 * Stemmer FR léger : enlève les suffixes flexionnels les plus fréquents
 * (pluriel, féminin, conjugaisons régulières). On garde au moins 3 lettres
 * de racine pour éviter de tout tronquer sur les mots courts. Liste triée
 * du plus long au plus court : « meilleures » → strip « es », pas « s ».
 */
function frenchStem(word: string): string {
  // Ordre important : suffixes les plus longs d'abord pour éviter qu'un
  // suffixe court (ex. "s") ne soit retiré avant un plus long ("ures").
  const suffixes = [
    "ements",
    "ations", "ation",
    "ables", "able", "ibles", "ible",
    "ifs", "ives", "if", "ive",
    "iques", "ique",
    "ales", "ale", "aux",
    "euses", "euse", "eurs", "eur",
    "ieres", "iere", "iers", "ier",
    "elles", "elle",
    "ees", "ee",
    "ers", "er",
    "es", "ez",
    "e", "s",
  ];
  for (const sfx of suffixes) {
    if (word.length - sfx.length >= 3 && word.endsWith(sfx)) {
      return word.slice(0, -sfx.length);
    }
  }
  return word;
}

/**
 * Construit une regex qui matche le keyword avec tolérance aux flexions :
 * masculin/féminin (« meilleur » ↔ « meilleure »), singulier/pluriel
 * (« transport » ↔ « transports »), accents (déjà aplatis par `normalize`).
 *
 * Pour chaque mot du keyword on extrait sa racine et on autorise jusqu'à
 * 3 lettres de suffixe. Suffisant pour les flexions FR courantes sans
 * trop de faux positifs.
 *
 * Le texte testé doit avoir été passé par `normalize` au préalable.
 */
export function buildKeywordRegex(keyword: string): RegExp {
  const words = normalize(keyword).split(/\s+/).filter(Boolean);
  if (words.length === 0) return /(?!.*)/g;
  // [a-z]* : tolérance illimitée pour les suffixes (« kine »
  // → « kinesitherapeutes »). Faux positifs marginaux acceptables :
  // un keyword court comme « kine » peut matcher « kinema », mais ces
  // mots sont rares en pratique et le gain de couverture est largement
  // supérieur (matche genre/nombre + dérivés du même radical).
  const patterns = words.map((w) => `${escapeRegex(frenchStem(w))}[a-z]*`);
  // Entre les termes du keyword on autorise jusqu'à 2 mots interposés :
  // « meilleur transport » matche aussi « meilleure entreprise transport ».
  const between = `(?:\\s+[a-z'-]+){0,2}\\s+`;
  return new RegExp(`\\b${patterns.join(between)}\\b`, "gi");
}

export type EditorData = {
  text: string;
  h1s: string[];
  h2s: string[];
  h3s: string[];
  // Nombre d'images insérées dans le contenu rédigé. Compté côté UI (DOM
  // count des `<img>` dans l'éditeur). 0 par défaut si non fourni — le
  // critère images vaudra alors 0/3.
  imageCount?: number;
};

export type ScoreCriterion = {
  score: number;
  max: number;
  details: Record<string, number | string | boolean>;
};

export type DetailedScore = {
  // `total` est le score AFFICHE à l'utilisateur. Si `competitorScores` est
  // fourni à computeDetailedScore, ce total est *relatif* à la médiane des
  // top 10 (médiane = 50, médiane × 1.5 = 100). Sinon c'est le brut.
  total: number;
  // Score absolu (brut) : combiné SEO + GEO sur 100 sans relativisation.
  // Toujours rempli même quand le total est relatif. Utile pour debug, API
  // V2, et pour comparer avec la médiane des concurrents.
  rawTotal: number;
  // Médiane des scores bruts des concurrents top 10 utilisée pour la
  // relativisation. 0 si aucun concurrent fourni.
  competitorMedian: number;
  seoTotal: number;    // /100, juste SEO (brut)
  geoTotal: number;    // /100, juste GEO (brut)
  keyword: ScoreCriterion;
  nlpCoverage: ScoreCriterion;
  contentLength: ScoreCriterion;
  headings: ScoreCriterion;
  placement: ScoreCriterion;
  structure: ScoreCriterion;
  quality: ScoreCriterion;
  images: ScoreCriterion;
  // Sémantique : moyenne des scores cosinus paragraphe vs centroïde top 10.
  // Sur 10 pts. Calculé côté client (live editor) à partir des scores
  // récupérés via /api/v2/briefs/[id]/semantic-paragraph et passés en
  // input à computeDetailedScore. max=0 si aucun score fourni (brief sans
  // semanticCentroid ou éditeur n'ayant pas encore appelé l'endpoint).
  semantic: ScoreCriterion;
  geo: GeoScore;
};

/** Scores cosinus 0-1 par paragraphe utilisateur, dans l'ordre de l'éditeur. */
export type ParagraphSemanticScore = { score: number };

const EMPTY: DetailedScore = {
  total: 0,
  rawTotal: 0,
  competitorMedian: 0,
  seoTotal: 0,
  geoTotal: 0,
  keyword: { score: 0, max: 15, details: {} },
  nlpCoverage: { score: 0, max: 27, details: {} },
  contentLength: { score: 0, max: 7, details: {} },
  headings: { score: 0, max: 13, details: {} },
  placement: { score: 0, max: 13, details: {} },
  structure: { score: 0, max: 6, details: {} },
  quality: { score: 0, max: 5, details: {} },
  images: { score: 0, max: 0, details: {} },
  semantic: { score: 0, max: 10, details: {} },
  geo: computeGeoScore(EMPTY_GEO_SIGNALS),
};

// Plancher de médiane utilisé par relativizeScore. Sur les KW à concu
// faible (médiane top 10 < 60), on calibre "comme si" la concu était à 60,
// soit le niveau d'un contenu correctement optimisé. Évite que l'utilisateur
// tape 92-98 juste parce que les top 10 sont moyens : sur "costume homme
// beige" (médiane 53), un brut 72 affichait 92 avant le floor (Pierre
// 2026-05-08 : "pas cohérent"). Avec floor à 60, ça affiche 70.
const RELATIVE_MEDIAN_FLOOR = 60;

/**
 * Score relatif à la médiane des top 10 concurrents.
 *
 *   ref = max(60, competitorMedian)     (floor pour KW à concu faible)
 *   brut < ref    : 50 × brut / ref     (ref = 50)
 *   brut >= ref   : 50 + 50 × min(1, (brut - ref) / (ref × 0.5))
 *                                       (ref × 1.5 = 100)
 *
 * Validé avec Pierre via le bench scripts/score-bench.ts (2026-05-08).
 * L'objectif est de rendre le score comparable d'un KW à l'autre tout en
 * gardant un sens absolu : pour dépasser 70-80, il faut un vrai contenu
 * solide, pas juste écraser des concurrents médiocres.
 */
export function relativizeScore(rawTotal: number, competitorMedian: number): number {
  if (competitorMedian <= 0) return rawTotal; // pas de concu mesurée
  const ref = Math.max(RELATIVE_MEDIAN_FLOOR, competitorMedian);
  if (rawTotal < ref) {
    return Math.round(50 * (rawTotal / ref));
  }
  return Math.min(
    100,
    Math.round(50 + 50 * Math.min(1, (rawTotal - ref) / (ref * 0.5))),
  );
}

/**
 * Calcule (ou récupère) les scores bruts des concurrents top 10 pour un
 * brief. Sert le lazy backfill : briefs créés avant l'itération 7 n'ont
 * pas `nlp.competitorScores` ; on les calcule à la volée depuis serpJson.
 *
 * Pour les briefs récents (analysis pipeline mis à jour), `nlp.competitorScores`
 * est déjà rempli au moment de l'analyse et on retourne directement.
 *
 * Cette fonction est *pure* : elle ne persiste rien en BDD. La persistance
 * a lieu naturellement à la prochaine sauvegarde du brief (rescoreBrief
 * sérialise le NlpResult complet).
 */
export function ensureCompetitorScores(
  nlp: NlpResult,
  serpJson: string | null,
): number[] {
  if (nlp.competitorScores && nlp.competitorScores.length > 0) {
    return nlp.competitorScores;
  }
  if (!serpJson) return [];
  let serp: Record<string, SerpResult> | SerpResult[];
  try {
    serp = JSON.parse(serpJson);
  } catch {
    return [];
  }
  const results = Array.isArray(serp)
    ? serp
    : Object.keys(serp)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (serp as Record<string, SerpResult>)[k]);
  const scores: number[] = [];
  for (const r of results) {
    if (!r || !r.text || (r.wordCount ?? 0) < 50) continue;
    const geoSignals = r.structuredHtml ? geoSignalsFromHtml(r.structuredHtml) : undefined;
    const breakdown = computeDetailedScore(
      {
        text: r.text,
        h1s: r.h1 ?? [],
        h2s: r.h2 ?? [],
        h3s: r.h3 ?? [],
        imageCount: r.imageCount ?? 0,
      },
      nlp,
      geoSignals,
      // Pas de competitorScores ici : on calcule le score brut absolu.
    );
    scores.push(breakdown.rawTotal);
  }
  // Cache en mémoire sur l'objet nlp pour les appels suivants dans la même
  // requête (évite de re-scorer 10 concurrents pour chaque computeDetailedScore).
  nlp.competitorScores = scores;
  return scores;
}

/**
 * Score plancher sous lequel un concurrent est considéré mal crawlé
 * (rendu JS non capté, blocage anti-bot, parser cassé, page produit sans
 * texte éditorial) plutôt que réellement mauvais. Ces pages sont exclues
 * du calcul de la médiane de référence et signalées comme telles dans
 * l'UI (pour ne pas faire croire que le concurrent est nul alors que
 * c'est notre extraction qui a échoué).
 */
export const MIN_VALID_COMPETITOR_SCORE = 25;

/**
 * Médiane d'une liste de scores. Filtre les valeurs aberrantes
 * (< MIN_VALID_COMPETITOR_SCORE) qui correspondent quasi systématiquement
 * à des pages mal scrapées. Sans ce filtre, ces outliers tirent la médiane
 * vers le bas et rendent l'objectif relatif trop facile à atteindre.
 */
export function medianCompetitorScore(scores: number[]): number {
  const valid = scores.filter((s) => s >= MIN_VALID_COMPETITOR_SCORE);
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function computeDetailedScore(
  ed: EditorData,
  nlp: NlpResult | null,
  geoSignals: GeoSignals = EMPTY_GEO_SIGNALS,
  // Scores bruts des top 10 concurrents (mêmes que ceux retournés par
  // computeDetailedScore appliqué à chaque concurrent). Si fourni, le
  // `total` retourné est relatif à la médiane des concurrents (cf.
  // relativizeScore). Sinon, `total` = score brut.
  competitorScores?: number[],
  // Scores cosinus 0-1 de chaque paragraphe utilisateur vs centroïde
  // sémantique top 10. Calculé côté client via debounce sur l'éditeur,
  // récupéré via /api/v2/briefs/[id]/semantic-paragraph. Si absent (brief
  // antérieur à l'iter sémantique ou éditeur n'ayant pas encore appelé),
  // le critère sémantique est neutralisé (max=0, renormalisation).
  paragraphSemanticScores?: ParagraphSemanticScore[],
): DetailedScore {
  const geo = computeGeoScore(geoSignals);
  // Pondération SEO (itération 9, 2026-06-10) :
  //   keyword 15 + nlpCoverage 27 + contentLength 7 + headings 13 +
  //   placement 13 + structure 6 + quality 5 + semantic 10 = 96,
  //   renormalisé sur 100 (images retiré du scoring, décision Pierre
  //   2026-06-10 suite retours utilisateurs ; le critère reste à max=0
  //   dans le breakdown pour compat API).
  // SEO_WEIGHT 0.92 + GEO_WEIGHT 0.08.
  //
  // Itération 7 : rebalance complet (Pierre : "le score monte trop vite à
  // 80 puis bloque à 90"). Bench scripts/score-bench.ts a confirmé qu'un
  // brouillon zéro NLP tapait 55/100 (= médiane top 10) avec l'ancienne
  // pondération. On a réduit les critères "gratuits" (length, headings,
  // structure, quality) au profit de nlpCoverage (vrai discriminant).
  //
  // Itération 8 : ajout du critère sémantique (embedding paragraphe vs
  // centroïde top 10). nlpCoverage 35→27 + placement 14→13 + length 8→7
  // pour libérer 10 pts. Critère neutralisé (max=0, renormalisation) si
  // brief antérieur sans semanticCentroid ou éditeur sans paragraphes
  // scorés.
  //
  // Cible bench : top 10 médiane 55-70, brouillon synth 30-45, optim
  // sérieux 80-92.
  const competitorMedian = competitorScores ? medianCompetitorScore(competitorScores) : 0;
  const r: DetailedScore = {
    total: 0,
    rawTotal: 0,
    competitorMedian,
    seoTotal: 0,
    geoTotal: geo.total,
    keyword: { score: 0, max: 15, details: {} },
    nlpCoverage: { score: 0, max: 27, details: {} },
    contentLength: { score: 0, max: 7, details: {} },
    headings: { score: 0, max: 13, details: {} },
    placement: { score: 0, max: 13, details: {} },
    structure: { score: 0, max: 6, details: {} },
    quality: { score: 0, max: 5, details: {} },
    images: { score: 0, max: 0, details: {} },
    semantic: { score: 0, max: 10, details: {} },
    geo,
  };
  if (!nlp?.nlpTerms) {
    // Sans NLP on ne peut pas calculer le SEO ; on remonte quand même
    // le score GEO car il dépend uniquement du contenu rédigé.
    r.rawTotal = Math.round(geo.total * GEO_WEIGHT);
    r.total = competitorMedian > 0 ? relativizeScore(r.rawTotal, competitorMedian) : r.rawTotal;
    return r;
  }

  const text = ed.text;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  if (wc < 5) return { ...EMPTY };

  const lowerNorm = normalize(text);
  const ek = nlp.exactKeyword;
  const variationsNorm = (ek.variations ?? []).map(normalize);
  // Regex tolérante aux flexions (genre/nombre/accents) du mot-clé.
  const rx = buildKeywordRegex(ek.keyword);

  // 1. KEYWORD /15
  // Algo en 2 couches, rééquilibré le 2026-05-02 :
  //   a. Soft score (max 7) basé sur la couverture des tokens significatifs
  //      du keyword. Sans le keyword exact écrit pile dans le contenu, on
  //      plafonne à 7/15 (≈47 %). Pierre a remonté que des contenus sans
  //      keyword exact arrivaient à des scores trop hauts → on resserre.
  //   b. Bonus exact (jusqu'à 8) : la page qui écrit le keyword pile
  //      reprend la majorité des points. Combiné softScore + exactBonus
  //      permet d'atteindre 15/15 quand tout est en place.
  const kwTokens = significantKwTokens(ek.keyword);
  const kwCov = tokenCoverage(lowerNorm, kwTokens);
  const softScore = Math.round(kwCov * 7);

  const m = lowerNorm.match(rx);
  const count = m ? m.length : 0;
  const density = wc > 0 ? ((count * ek.keyword.split(/\s+/).length) / wc) * 100 : 0;
  // Bonus exact : plafond 8 points (vs 4 avant). Pondération
  // density (jusqu'à 4.8) + count (jusqu'à 3.2).
  let exactBonus = 0;
  if (count > 0) {
    const dB =
      density >= ek.idealDensityMin && density <= ek.idealDensityMax
        ? 4.8
        : density > 0 && density < ek.idealDensityMin
          ? (density / ek.idealDensityMin) * 4.8
          : density > ek.idealDensityMax
            ? Math.max(1, 4.8 - (density - ek.idealDensityMax) * 1.6)
            : 0;
    const cR = ek.avgCount > 0 ? count / ek.avgCount : 0;
    const cB = cR >= 0.7 && cR <= 1.5 ? 3.2 : Math.min(3.2, cR * 3.2);
    exactBonus = Math.round(dB + cB);
  }
  r.keyword.score = Math.min(15, softScore + exactBonus);
  r.keyword.details = {
    count,
    density: Math.round(density * 100) / 100,
    softCoverage: `${Math.round(kwCov * 100)}%`,
    exactBonus,
  };

  // 2. NLP /27 — split par tier (cohérent avec l'UI brief-view/editor).
  // Essentiels (presence ≥ 70) : 17 pts linéaire → 100% requis pour le max.
  // Importants (40 ≤ presence < 70) : 10 pts linéaire.
  // Opportunités (< 40) ignorées : ce sont des bonus, pas des termes
  // obligatoires.
  //
  // Historique : iter 5 25 pts, iter 7 35 pts (rebalance vers NLP), iter 8
  // 27 pts (8 pts redistribués vers le critère sémantique paragraphe).
  // Le NLP reste le critère discriminant principal entre un brouillon et
  // un contenu sérieux.
  // slice(0, 40) PUIS filtre junk : même ordre que la sidebar de l'éditeur
  // (brief-editor.tsx) pour que les termes comptés soient exactement les
  // chips affichées. Avant le 2026-06-10, les termes junk ("quelle",
  // "faut-il"...) étaient masqués à l'écran mais comptés dans le scoring.
  const top40 = nlp.nlpTerms
    .slice(0, 40)
    .filter((t) => !isJunkNlpTerm(t.term, nlp.exactKeyword.keyword));
  const essentials = top40.filter((t) => t.presence >= 70);
  const importants = top40.filter((t) => t.presence >= 40 && t.presence < 70);
  const matchTerm = (t: NlpTerm): boolean => {
    if (t.variants && t.variants.length > 0) {
      return t.variants.some((v) => lowerNorm.includes(normalize(v)));
    }
    return lowerNorm.includes(normalize(t.term));
  };
  const essUsed = essentials.filter(matchTerm).length;
  const impUsed = importants.filter(matchTerm).length;
  // Si pas de termes dans le tier, coverage = 1 (rien à plomber).
  const essCov = essentials.length > 0 ? essUsed / essentials.length : 1;
  const impCov = importants.length > 0 ? impUsed / importants.length : 1;
  // Itération 8 (2026-05-08) : nlpCoverage 35→27 pour libérer 8 pts au
  // profit du critère sémantique paragraphe (validé Pierre option A).
  // Essentiels 17 + Importants 10. Ratio préservé.
  const essScore = Math.min(17, Math.round(essCov * 17));
  const impScore = Math.min(10, Math.round(impCov * 10));
  r.nlpCoverage.score = essScore + impScore;
  r.nlpCoverage.details = {
    essentialsUsed: essUsed,
    essentialsTotal: essentials.length,
    essentialsCoverage: Math.round(essCov * 100),
    essentialsScore: essScore,
    importantsUsed: impUsed,
    importantsTotal: importants.length,
    importantsCoverage: Math.round(impCov * 100),
    importantsScore: impScore,
    // Champs legacy conservés pour rétro-compat (UI/API consommateurs).
    used: essUsed + impUsed,
    total: essentials.length + importants.length,
    coverage: Math.round(((essCov * 17 + impCov * 10) / 27) * 100),
  };

  // 3. LENGTH /7 (durci itération 7, recalibré itération 8 2026-05-08)
  // Itération 8 : passe de 8 à 7 pour faire de la place au sémantique.
  // Paliers proportionnels : 3 / +2 / +2.
  {
    let s = 0;
    if (wc >= nlp.minWordCount && wc <= nlp.maxWordCount) s += 3;
    else if (wc < nlp.minWordCount) s += Math.round((wc / nlp.minWordCount) * 3);
    else s += 3;
    if (nlp.avgWordCount > 0) {
      const dev = Math.abs(wc - nlp.avgWordCount) / nlp.avgWordCount;
      if (dev <= 0.2) s += 2;
      if (wc >= nlp.avgWordCount) s += 2;
    }
    r.contentLength.score = Math.min(7, s);
    r.contentLength.details = { wc, target: nlp.avgWordCount };
  }

  // 4. HEADINGS /13 (durci itération 7, 2026-05-08)
  // Avant : un H1 unique donnait 6/15 (40 % du critère) sans rien d'autre.
  // Trop. Maintenant chaque sous-score est un peu plus exigeant : H1 unique
  // pèse 4, KW exact dans H1 pèse 3, H2 count vs concurrent pèse 3 max
  // (seuil 70 % de avgHeadings au lieu de 60 %), KW dans H2 pèse 2, H3 pèse
  // 1 mais demande au moins 2 H3 (avant : 1 seul H3 suffisait).
  {
    let s = 0;
    const h1sNorm = ed.h1s.map(normalize);
    const h2sNorm = ed.h2s.map(normalize);
    // `rx` est en mode global → on le clone par test pour éviter que
    // lastIndex ne pollue les itérations suivantes.
    const matchesKw = (h: string) => buildKeywordRegex(ek.keyword).test(h);
    if (ed.h1s.length === 1) s += 4;
    else if (ed.h1s.length > 1) s += 1;
    if (h1sNorm.some(matchesKw)) s += 3;
    else if (h1sNorm.some((h) => variationsNorm.some((v) => h.includes(v)))) s += 1;
    const h2T = Math.max(2, Math.round(nlp.avgHeadings * 0.7));
    if (ed.h2s.length >= h2T) s += 3;
    else if (ed.h2s.length >= h2T * 0.5) s += 1;
    if (
      h2sNorm.some(
        (h) =>
          buildKeywordRegex(ek.keyword).test(h) ||
          variationsNorm.some((v) => h.includes(v)),
      )
    )
      s += 2;
    if (ed.h3s.length >= 2) s += 1;
    r.headings.score = Math.min(13, s);
    r.headings.details = {
      h1: ed.h1s.length,
      h2: ed.h2s.length,
      h3: ed.h3s.length,
      h1HasKw: h1sNorm.some(matchesKw),
    };
  }

  // 5. PLACEMENT /13 (durci itération 7, recalibré /14→/13 itération 8)
  // Soft (couverture ≥ 60% des tokens significatifs) ou exact match dans les
  // segments-clés. Le palier "first 100 mots" passe de 5 à 4 pts en exact,
  // "1ère phrase" de 3 à 2 pts. La distribution sur les 4 quarts demande
  // maintenant au moins 3 quarts en KW exact pour le max (avant : 2 quarts
  // exact + soft suffisaient).
  {
    let s = 0;
    const matchesExact = (segment: string) => buildKeywordRegex(ek.keyword).test(segment);
    const matchesSoft = (segNorm: string) =>
      kwTokens.length > 0 && tokenCoverage(segNorm, kwTokens) >= 0.6;

    const f100 = normalize(words.slice(0, 100).join(" "));
    if (matchesExact(f100)) s += 4;
    else if (matchesSoft(f100)) s += 2;
    else if (variationsNorm.some((v) => f100.includes(v))) s += 1;

    const firstSent = normalize(text.split(/[.!?]\s/)[0]);
    if (matchesExact(firstSent)) s += 2;
    else if (matchesSoft(firstSent)) s += 1;

    const last100 = normalize(words.slice(-100).join(" "));
    if (matchesExact(last100)) s += 2;
    else if (matchesSoft(last100)) s += 1;

    const qL = Math.floor(words.length / 4);
    let qExact = 0;
    let qSoft = 0;
    for (let q = 0; q < 4; q++) {
      const seg = normalize(words.slice(q * qL, (q + 1) * qL).join(" "));
      if (matchesExact(seg)) qExact++;
      else if (matchesSoft(seg)) qSoft++;
    }
    // Distribution durcie : pour le max 5 pts il faut 3+ quarts en exact.
    // Soft compte moitié moins. Sans aucun kw exact, on plafonne à 2 pts ici.
    // Itération 8 : palier max 6→5 pour absorber le rebalance placement 14→13.
    const qScore = qExact * 1.3 + qSoft * 0.3;
    if (qScore >= 4) s += 5;
    else if (qScore >= 2.5) s += 3;
    else if (qScore >= 1.5) s += 2;
    else if (qScore >= 0.5) s += 1;

    r.placement.score = Math.min(13, s);
    r.placement.details = {
      distribution: `${qExact}/4 exact, ${qSoft}/4 soft`,
    };
  }

  // 6. STRUCTURE /6 (durci itération 7, 2026-05-08)
  // Avant : ratio paragraphes [0.5, 1.5] → 5/9 facile (texte avec 30
  // paragraphes pour une médiane à 60 cochait le max). Maintenant fenêtre
  // [0.7, 1.4] = vraiment proche de la médiane des concurrents. Longueur
  // moyenne paragraphes resserrée [40, 140]. Le bonus "wc >= 200" disparait
  // (déjà couvert par contentLength).
  {
    let s = 0;
    const pC = text.split(/\n\s*\n/).filter((p) => p.trim().length > 20).length;
    const pR = nlp.avgParagraphs > 0 ? pC / nlp.avgParagraphs : 0;
    if (pR >= 0.7 && pR <= 1.4) s += 3;
    else if (pR >= 0.4 && pR < 0.7) s += 1;
    else if (pR > 1.4 && pR <= 2.0) s += 1;
    const aP = pC > 0 ? wc / pC : wc;
    if (aP >= 40 && aP <= 140) s += 2;
    else if (aP >= 25 && aP <= 200) s += 1;
    if (wc >= 500) s += 1;
    r.structure.score = Math.min(6, s);
    r.structure.details = { paragraphs: pC, ratio: Math.round(pR * 100) / 100 };
  }

  // 7. QUALITY /5 (durci itération 7, 2026-05-08)
  // Avant : seuil diversité lexicale ≥ 0.4 → un brouillon répétitif touchait
  // 2/2. Maintenant ≥ 0.45 pour 1 pt et ≥ 0.55 pour 2 pts. Phrases moy
  // resserrées [12, 22]. Le bonus "wc ≥ 300" disparait (déjà dans
  // contentLength).
  {
    let s = 0;
    const sents = text.split(/[.!?]+/).filter((x) => x.trim().length > 10);
    const aS = sents.length > 0 ? wc / sents.length : wc;
    if (aS >= 12 && aS <= 22) s += 2;
    else if (aS >= 8 && aS <= 30) s += 1;
    // density est déjà calculé en section keyword ; on le réutilise pour
    // pénaliser le keyword stuffing.
    if (density <= 2.5) s += 1;
    const uniq = new Set(words.map((w) => w.toLowerCase()));
    const div = uniq.size / words.length;
    if (div >= 0.55) s += 2;
    else if (div >= 0.45) s += 1;
    r.quality.score = Math.min(5, s);
    r.quality.details = { diversity: Math.round(div * 100) };
  }

  // 9. SÉMANTIQUE PARAGRAPHE /10 (itération 8, 2026-05-08)
  // Moyenne des scores cosinus paragraphe vs centroïde top 10. Calculé côté
  // client (live editor) et passé en `paragraphSemanticScores`. Si absent,
  // critère neutralisé (max=0, renormalisation comme images).
  //
  // Mapping cosinus → 10 pts (recalibré 2026-05-20) :
  //   cosinus moyen ≥ 0.78 (excellent) → 10/10
  //   cosinus moyen = 0.68 → 7/10
  //   cosinus moyen = 0.60 (correct) → 5/10
  //   cosinus moyen = 0.50 → 3/10
  //   cosinus moyen = 0.40 (faible) → 1/10
  //   cosinus moyen ≤ 0.32 → 0/10
  //
  // Choix d'une mapping non linéaire car les scores bge-m3 sur du contenu
  // français se concentrent dans la zone 0.40-0.85. Recalibrage : l'ancien
  // plafond à 0.85 était quasi inatteignable (presque rien ne dépasse 0.80
  // de cosinus moyen), ce qui transformait le critère en malus permanent
  // (un bon contenu à 0.65-0.70 ne tapait que 5-6/10, sous son niveau sur
  // les autres critères, et faisait baisser le total renormalisé). Le
  // plafond passe à 0.78 et le milieu est relevé pour qu'un contenu qui
  // colle vraiment au sujet du top 10 soit récompensé. Validé via
  // scripts/semantic-recalib-bench.ts (impact +0 à +4 sur le score affiché,
  // concentré sur la zone réaliste 0.68-0.75).
  //
  // NB : ce mapping reste absolu. Le passage à un scoring relatif aux
  // competitorSemanticScores (cohérent avec relativizeScore) est suivi à
  // part et nécessite une validation sur un brief prod récent.
  if (paragraphSemanticScores && paragraphSemanticScores.length > 0) {
    const avg =
      paragraphSemanticScores.reduce((acc, p) => acc + p.score, 0) /
      paragraphSemanticScores.length;
    let s: number;
    if (avg >= 0.78) s = 10;
    else if (avg >= 0.68) s = Math.round(7 + ((avg - 0.68) / 0.1) * 3);
    else if (avg >= 0.6) s = Math.round(5 + ((avg - 0.6) / 0.08) * 2);
    else if (avg >= 0.5) s = Math.round(3 + ((avg - 0.5) / 0.1) * 2);
    else if (avg >= 0.4) s = Math.round(1 + ((avg - 0.4) / 0.1) * 2);
    else if (avg > 0.32) s = Math.round(((avg - 0.32) / 0.08) * 1);
    else s = 0;
    r.semantic.score = Math.max(0, Math.min(10, s));
    r.semantic.details = {
      paragraphsScored: paragraphSemanticScores.length,
      avgCosine: Math.round(avg * 1000) / 1000,
    };
  } else {
    // Critère neutralisé (cf. images quand médiane=0).
    r.semantic.max = 0;
    r.semantic.details = { paragraphsScored: 0 };
  }

  // 8. IMAGES — RETIRÉ DU SCORING (itération 9, décision Pierre 2026-06-10,
  // retour utilisateurs : "pas utile d'avoir un score sur les images").
  // Le critère reste dans la structure DetailedScore (compat API : les
  // consommateurs du breakdown lisent r.images) mais est neutralisé en
  // permanence : max=0, renormalisation sur 100 comme pour le critère
  // sémantique absent. Le détail count/target est conservé à titre
  // informatif (médiane concurrents), il n'influence plus le total.
  {
    const userImg = ed.imageCount ?? 0;
    const target = nlp.medianImages ?? 0;
    r.images.score = 0;
    r.images.max = 0;
    r.images.details = {
      count: userImg,
      target,
    };
  }

  // Re-normalisation sur 100 : si un critère a été neutralisé (images
  // quand médiane=0, semantic quand pas de centroïde / pas de scores
  // par paragraphe), son `.max` passe à 0. Le total partiel doit être
  // ramené sur 100 pour ne pas pénaliser injustement le contenu.
  const sumScore =
    r.keyword.score +
    r.nlpCoverage.score +
    r.contentLength.score +
    r.headings.score +
    r.placement.score +
    r.structure.score +
    r.quality.score +
    r.images.score +
    r.semantic.score;
  const sumMax =
    r.keyword.max +
    r.nlpCoverage.max +
    r.contentLength.max +
    r.headings.max +
    r.placement.max +
    r.structure.max +
    r.quality.max +
    r.images.max +
    r.semantic.max;
  r.seoTotal = sumMax > 0 ? Math.min(100, Math.round((sumScore / sumMax) * 100)) : 0;
  r.rawTotal = Math.min(
    100,
    Math.round(r.seoTotal * SEO_WEIGHT + r.geoTotal * GEO_WEIGHT),
  );
  // Score affiché : relatif à la concu si on a la médiane, sinon brut.
  r.total = competitorMedian > 0 ? relativizeScore(r.rawTotal, competitorMedian) : r.rawTotal;
  return r;
}
