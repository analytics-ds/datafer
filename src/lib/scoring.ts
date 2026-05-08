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
function normalize(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // Apostrophes typographiques et droites → espaces. Sans ça
      // « d'électrostimulation » bloquait le matching mot-à-mot
      // (pas d'espace entre l'apostrophe et le mot suivant).
      .replace(/['']/g, " ")
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  geo: GeoScore;
};

const EMPTY: DetailedScore = {
  total: 0,
  rawTotal: 0,
  competitorMedian: 0,
  seoTotal: 0,
  geoTotal: 0,
  keyword: { score: 0, max: 15, details: {} },
  nlpCoverage: { score: 0, max: 35, details: {} },
  contentLength: { score: 0, max: 8, details: {} },
  headings: { score: 0, max: 13, details: {} },
  placement: { score: 0, max: 14, details: {} },
  structure: { score: 0, max: 6, details: {} },
  quality: { score: 0, max: 5, details: {} },
  images: { score: 0, max: 4, details: {} },
  geo: computeGeoScore(EMPTY_GEO_SIGNALS),
};

/**
 * Score relatif à la médiane des top 10 concurrents.
 *
 *   brut < médiane    : 50 × brut / médiane           (médiane = 50)
 *   brut >= médiane   : 50 + 50 × min(1, (brut - médiane) / (médiane × 0.5))
 *                                                     (médiane × 1.5 = 100)
 *
 * Validé avec Pierre via le bench scripts/score-bench.ts (2026-05-08).
 * L'objectif est de rendre le score comparable d'un KW à l'autre : taper
 * 50 sur un KW à concu faible (médiane 40) ou à concu forte (médiane 75)
 * veut dire la même chose : "je suis au niveau de la concurrence". Pour
 * dépasser 80, il faut écraser le top 10.
 */
export function relativizeScore(rawTotal: number, competitorMedian: number): number {
  if (competitorMedian <= 0) return rawTotal; // pas de concu mesurée
  if (rawTotal < competitorMedian) {
    return Math.round(50 * (rawTotal / competitorMedian));
  }
  return Math.min(
    100,
    Math.round(
      50 + 50 * Math.min(1, (rawTotal - competitorMedian) / (competitorMedian * 0.5)),
    ),
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
 * Médiane d'une liste de scores. Filtre les valeurs aberrantes (< 25)
 * qui correspondent quasi systématiquement à des pages mal scrapées
 * (parser cassé, contenu majoritairement bloqué, page produit sans
 * texte éditorial). Sans ce filtre, ces outliers tirent la médiane vers
 * le bas et rendent l'objectif relatif trop facile à atteindre.
 */
export function medianCompetitorScore(scores: number[]): number {
  const valid = scores.filter((s) => s >= 25);
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
): DetailedScore {
  const geo = computeGeoScore(geoSignals);
  // Pondération SEO sur 100 (itération 7, 2026-05-08) :
  //   keyword 15 + nlpCoverage 35 + contentLength 8 + headings 13 +
  //   placement 14 + structure 6 + quality 5 + images 4 = 100.
  //
  // Pourquoi : Pierre a remonté que le score grimpait trop vite à 80 puis
  // bloquait à 90. Bench `scripts/score-bench.ts` a confirmé : un brouillon
  // synthétique zéro NLP (juste H1 + 3 H2 + KW dans first 100) tapait 55/100,
  // soit la médiane des top 10 réels. Donc 75% des points venaient de
  // critères "structurels gratuits". On rééquilibre :
  //   - nlpCoverage 25 → 35 : le vrai discriminant SEO entre concurrents
  //   - contentLength 12 → 8, headings 15 → 13, placement 15 → 14, structure
  //     9 → 6, quality 6 → 5 : critères trop tolérants, on resserre
  //   - images 3 → 4 : ne plus donner 3 pts gratos quand médiane = 0
  //
  // Les paliers internes de chaque critère sont aussi durcis (cf. sections
  // ci-dessous). Cible vérifiée par le bench : top 10 médiane 55-70,
  // brouillon synth 30-45, optim sérieux 80-92.
  const competitorMedian = competitorScores ? medianCompetitorScore(competitorScores) : 0;
  const r: DetailedScore = {
    total: 0,
    rawTotal: 0,
    competitorMedian,
    seoTotal: 0,
    geoTotal: geo.total,
    keyword: { score: 0, max: 15, details: {} },
    nlpCoverage: { score: 0, max: 35, details: {} },
    contentLength: { score: 0, max: 8, details: {} },
    headings: { score: 0, max: 13, details: {} },
    placement: { score: 0, max: 14, details: {} },
    structure: { score: 0, max: 6, details: {} },
    quality: { score: 0, max: 5, details: {} },
    images: { score: 0, max: 4, details: {} },
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

  // 2. NLP /35 — split par tier (cohérent avec l'UI brief-view/editor).
  // Essentiels (presence ≥ 70) : 22 pts linéaire → 100% requis pour le max.
  // Importants (40 ≤ presence < 70) : 13 pts linéaire.
  // Opportunités (< 40) ignorées : ce sont des bonus, pas des termes
  // obligatoires.
  //
  // Itération 7 (2026-05-08) : nlpCoverage passe de 25 à 35. C'est la grosse
  // décision du rebalance. Le NLP est le vrai discriminant entre un
  // brouillon et un contenu sérieux ; doubler son poids relatif pousse les
  // contenus zéro-NLP vers 35-45 (au lieu de 55), tout en laissant
  // accessibles les 80+ pour les contenus qui couvrent essentiels +
  // importants.
  const top40 = nlp.nlpTerms.slice(0, 40);
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
  const essScore = Math.min(22, Math.round(essCov * 22));
  const impScore = Math.min(13, Math.round(impCov * 13));
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
    coverage: Math.round(((essCov * 22 + impCov * 13) / 35) * 100),
  };

  // 3. LENGTH /8 (durci itération 7, 2026-05-08)
  // Avant : être dans [min, max] suffisait pour 12/12. Trop tolérant — un
  // brouillon de 1500 mots sur une fourchette 1383-2568 cochait le max.
  // Maintenant on récompense vraiment de viser la médiane des concurrents.
  //   - 4 pts : wc dans [min, max]
  //   - +2 pts : wc à ±20 % de avgWordCount (effort de viser la cible)
  //   - +2 pts : wc >= avgWordCount (être au moins dans la moitié haute)
  //   - en dessous de min : ratio linéaire vers 4 pts max
  //   - au dessus de max : on garde 4 pts (pénalité légère, on ne punit
  //     pas le contenu trop long si le reste est solide)
  {
    let s = 0;
    if (wc >= nlp.minWordCount && wc <= nlp.maxWordCount) s += 4;
    else if (wc < nlp.minWordCount) s += Math.round((wc / nlp.minWordCount) * 4);
    else s += 4; // au dessus de max, on garde le palier de base
    if (nlp.avgWordCount > 0) {
      const dev = Math.abs(wc - nlp.avgWordCount) / nlp.avgWordCount;
      if (dev <= 0.2) s += 2;
      if (wc >= nlp.avgWordCount) s += 2;
    }
    r.contentLength.score = Math.min(8, s);
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

  // 5. PLACEMENT /14 (durci itération 7, 2026-05-08)
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
    // Distribution durcie : pour le max 6 pts il faut 3+ quarts en exact.
    // Soft compte moitié moins. Sans aucun kw exact, on plafonne à 2 pts ici.
    const qScore = qExact * 1.3 + qSoft * 0.3;
    if (qScore >= 4) s += 6;
    else if (qScore >= 2.5) s += 4;
    else if (qScore >= 1.5) s += 2;
    else if (qScore >= 0.5) s += 1;

    r.placement.score = Math.min(14, s);
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

  // 8. IMAGES /4 (durci itération 7, 2026-05-08)
  // Avant : si médiane = 0 → 3/3 free pass. Maintenant le critère est
  // neutralisé en passant à 0/0 (pas dans le total) plutôt que d'offrir 3
  // pts gratos. Sinon linéaire vers la médiane des concurrents, max 4.
  {
    const userImg = ed.imageCount ?? 0;
    const target = nlp.medianImages ?? 0;
    let s: number;
    if (target <= 0) {
      // Pas de cible : on neutralise le critère (0 sur 0 effectif).
      // On retire aussi 4 pts du max pour ne pas pénaliser ; rééquilibrage
      // proportionnel sur le seoTotal final via re-normalisation.
      s = 0;
      r.images.max = 0;
    } else if (userImg >= target) {
      s = 4;
    } else {
      s = Math.max(0, Math.round((userImg / target) * 4));
    }
    r.images.score = s;
    r.images.details = {
      count: userImg,
      target,
    };
  }

  // Re-normalisation sur 100 : si un critère a été neutralisé (images
  // quand médiane=0, son `.max` passe à 0), le total sur 96 doit être
  // ramené sur 100 pour ne pas pénaliser injustement le contenu.
  const sumScore =
    r.keyword.score +
    r.nlpCoverage.score +
    r.contentLength.score +
    r.headings.score +
    r.placement.score +
    r.structure.score +
    r.quality.score +
    r.images.score;
  const sumMax =
    r.keyword.max +
    r.nlpCoverage.max +
    r.contentLength.max +
    r.headings.max +
    r.placement.max +
    r.structure.max +
    r.quality.max +
    r.images.max;
  r.seoTotal = sumMax > 0 ? Math.min(100, Math.round((sumScore / sumMax) * 100)) : 0;
  r.rawTotal = Math.min(
    100,
    Math.round(r.seoTotal * SEO_WEIGHT + r.geoTotal * GEO_WEIGHT),
  );
  // Score affiché : relatif à la concu si on a la médiane, sinon brut.
  r.total = competitorMedian > 0 ? relativizeScore(r.rawTotal, competitorMedian) : r.rawTotal;
  return r;
}
