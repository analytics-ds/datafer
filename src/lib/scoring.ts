/**
 * Scoring /100 sur 7 critères, porté depuis seo-forge-v4.html.
 * Exécuté côté client à chaque édition pour un feedback temps réel.
 */
import type { NlpResult } from "./analysis";

/**
 * Normalisation lowercase + suppression des diacritiques (accents).
 * Utilisée des deux côtés du matching KW pour que "moto électrique" et
 * "moto electrique" matchent la même chose. Google fait pareil en SERP.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type EditorData = {
  text: string;
  h1s: string[];
  h2s: string[];
  h3s: string[];
};

export type ScoreCriterion = {
  score: number;
  max: number;
  details: Record<string, number | string | boolean>;
};

export type DetailedScore = {
  total: number;
  keyword: ScoreCriterion;
  nlpCoverage: ScoreCriterion;
  contentLength: ScoreCriterion;
  headings: ScoreCriterion;
  placement: ScoreCriterion;
  structure: ScoreCriterion;
  quality: ScoreCriterion;
};

const EMPTY: DetailedScore = {
  total: 0,
  keyword: { score: 0, max: 15, details: {} },
  nlpCoverage: { score: 0, max: 20, details: {} },
  contentLength: { score: 0, max: 12, details: {} },
  headings: { score: 0, max: 18, details: {} },
  placement: { score: 0, max: 15, details: {} },
  structure: { score: 0, max: 10, details: {} },
  quality: { score: 0, max: 10, details: {} },
};

export function computeDetailedScore(
  ed: EditorData,
  nlp: NlpResult | null,
): DetailedScore {
  const r: DetailedScore = {
    total: 0,
    keyword: { score: 0, max: 15, details: {} },
    nlpCoverage: { score: 0, max: 20, details: {} },
    contentLength: { score: 0, max: 12, details: {} },
    headings: { score: 0, max: 18, details: {} },
    placement: { score: 0, max: 15, details: {} },
    structure: { score: 0, max: 10, details: {} },
    quality: { score: 0, max: 10, details: {} },
  };
  if (!nlp?.nlpTerms) return r;

  const text = ed.text;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  if (wc < 5) return { ...EMPTY };

  const lowerNorm = normalize(text);
  const ek = nlp.exactKeyword;
  const kwNorm = normalize(ek.keyword);
  const variationsNorm = (ek.variations ?? []).map(normalize);

  // 1. KEYWORD /15
  const rx = new RegExp(kwNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const m = lowerNorm.match(rx);
  const count = m ? m.length : 0;
  const density = wc > 0 ? ((count * ek.keyword.split(/\s+/).length) / wc) * 100 : 0;
  let dS =
    density >= ek.idealDensityMin && density <= ek.idealDensityMax
      ? 9
      : density > 0 && density < ek.idealDensityMin
        ? Math.round((density / ek.idealDensityMin) * 9)
        : density > ek.idealDensityMax
          ? Math.max(2, 9 - Math.round((density - ek.idealDensityMax) * 3))
          : 0;
  let cS = 0;
  const cR = ek.avgCount > 0 ? count / ek.avgCount : 0;
  if (cR >= 0.7 && cR <= 1.5) cS = 6;
  else if (cR > 0) cS = Math.min(6, Math.round(cR * 6));
  r.keyword.score = Math.min(15, dS + cS);
  r.keyword.details = { count, density: Math.round(density * 100) / 100 };

  // 2. NLP /20
  const top30 = nlp.nlpTerms.slice(0, 30);
  let used = 0;
  top30.forEach((t) => {
    // On accepte n'importe quelle variante morphologique du terme (stemming).
    // Normalisation des accents des deux côtés (texte et terme NLP).
    if (t.variants && t.variants.length > 0) {
      if (t.variants.some((v) => lowerNorm.includes(normalize(v)))) used++;
    } else if (lowerNorm.includes(normalize(t.term))) {
      used++;
    }
  });
  const cov = top30.length > 0 ? used / top30.length : 0;
  r.nlpCoverage.score =
    cov >= 0.8
      ? 20
      : cov >= 0.6
        ? 15 + Math.round(((cov - 0.6) / 0.2) * 5)
        : cov >= 0.4
          ? 9 + Math.round(((cov - 0.4) / 0.2) * 6)
          : cov >= 0.2
            ? 3 + Math.round(((cov - 0.2) / 0.2) * 6)
            : Math.round((cov / 0.2) * 3);
  r.nlpCoverage.details = { used, total: top30.length, coverage: Math.round(cov * 100) };

  // 3. LENGTH /12
  if (wc >= nlp.minWordCount && wc <= nlp.maxWordCount) r.contentLength.score = 12;
  else if (wc < nlp.minWordCount)
    r.contentLength.score = Math.round((wc / nlp.minWordCount) * 10);
  else
    r.contentLength.score = Math.max(
      7,
      12 - Math.round(((wc - nlp.maxWordCount) / nlp.maxWordCount) * 8),
    );
  r.contentLength.score = Math.min(12, r.contentLength.score);
  r.contentLength.details = { wc };

  // 4. HEADINGS /18
  {
    let s = 0;
    const h1sNorm = ed.h1s.map(normalize);
    const h2sNorm = ed.h2s.map(normalize);
    if (ed.h1s.length === 1) s += 6;
    else if (ed.h1s.length > 1) s += 2;
    if (h1sNorm.some((h) => h.includes(kwNorm))) s += 5;
    else if (h1sNorm.some((h) => variationsNorm.some((v) => h.includes(v)))) s += 2;
    const h2T = Math.max(2, Math.round(nlp.avgHeadings * 0.6));
    if (ed.h2s.length >= h2T) s += 4;
    else if (ed.h2s.length >= h2T * 0.5) s += 2;
    else if (ed.h2s.length > 0) s += 1;
    if (
      h2sNorm.some(
        (h) =>
          h.includes(kwNorm) ||
          variationsNorm.some((v) => h.includes(v)),
      )
    )
      s += 2;
    if (ed.h3s.length > 0) s += 1;
    r.headings.score = Math.min(18, s);
    r.headings.details = {
      h1: ed.h1s.length,
      h2: ed.h2s.length,
      h3: ed.h3s.length,
      h1HasKw: h1sNorm.some((h) => h.includes(kwNorm)),
    };
  }

  // 5. PLACEMENT /15
  {
    let s = 0;
    const f100 = normalize(words.slice(0, 100).join(" "));
    if (f100.includes(kwNorm)) s += 5;
    else if (variationsNorm.some((v) => f100.includes(v))) s += 2;
    if (normalize(text.split(/[.!?]\s/)[0]).includes(kwNorm)) s += 3;
    if (normalize(words.slice(-100).join(" ")).includes(kwNorm)) s += 2;
    const qL = Math.floor(words.length / 4);
    let qK = 0;
    for (let q = 0; q < 4; q++) {
      if (
        normalize(words.slice(q * qL, (q + 1) * qL).join(" ")).includes(kwNorm)
      )
        qK++;
    }
    if (qK >= 4) s += 5;
    else if (qK >= 3) s += 4;
    else if (qK >= 2) s += 2;
    else if (qK >= 1) s += 1;
    r.placement.score = Math.min(15, s);
    r.placement.details = { distribution: `${qK}/4` };
  }

  // 6. STRUCTURE /10
  {
    let s = 0;
    const pC = text.split(/\n\s*\n/).filter((p) => p.trim().length > 20).length;
    const pR = nlp.avgParagraphs > 0 ? pC / nlp.avgParagraphs : 0;
    if (pR >= 0.5 && pR <= 1.5) s += 5;
    else if (pR > 0) s += Math.min(5, Math.round(pR * 3));
    const aP = pC > 0 ? wc / pC : wc;
    if (aP >= 30 && aP <= 160) s += 3;
    else if (aP > 15) s += 1;
    if (wc >= 200) s += 1;
    if (wc >= 500) s += 1;
    r.structure.score = Math.min(10, s);
    r.structure.details = { paragraphs: pC };
  }

  // 7. QUALITY /10
  {
    let s = 0;
    const sents = text.split(/[.!?]+/).filter((x) => x.trim().length > 10);
    const aS = sents.length > 0 ? wc / sents.length : wc;
    if (aS >= 10 && aS <= 25) s += 3;
    else if (aS > 5 && aS < 35) s += 1;
    const kwD = ((lowerNorm.match(rx) ?? []).length * ek.keyword.split(/\s+/).length) / wc * 100;
    if (kwD <= 3) s += 2;
    const uniq = new Set(words.map((w) => w.toLowerCase()));
    const div = uniq.size / words.length;
    if (div >= 0.4) s += 3;
    else if (div >= 0.3) s += 2;
    else if (div >= 0.2) s += 1;
    if (wc >= 300) s += 1;
    if (wc >= 600) s += 1;
    r.quality.score = Math.min(10, s);
    r.quality.details = { diversity: Math.round(div * 100) };
  }

  r.total = Math.min(
    100,
    r.keyword.score +
      r.nlpCoverage.score +
      r.contentLength.score +
      r.headings.score +
      r.placement.score +
      r.structure.score +
      r.quality.score,
  );
  return r;
}
