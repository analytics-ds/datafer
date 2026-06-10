import { describe, it, expect } from "vitest";
import { applyBriefOverrides } from "@/lib/brief-overrides";
import type { NlpResult, NlpTerm } from "@/lib/analysis";

function makeTerm(term: string, presence = 50): NlpTerm {
  return {
    term,
    score: 1,
    presence,
    df: 2,
    inHeadings: false,
    minCount: 1,
    maxCount: 2,
    avgCount: 1,
  };
}

function makeNlp(terms: NlpTerm[]): NlpResult {
  return {
    exactKeyword: {
      keyword: "kw test",
      variations: [],
      avgCount: 1,
      avgDensity: 1,
      idealDensityMin: 0.3,
      idealDensityMax: 3,
      inH1Pct: 0,
      inH2Pct: 0,
      inFirst100Pct: 0,
    },
    keywordTerms: [],
    nlpTerms: terms,
    sections: [],
    entities: [],
    avgWordCount: 1000,
    avgHeadings: 8,
    avgParagraphs: 15,
    minWordCount: 700,
    maxWordCount: 1300,
    medianImages: 0,
  } as unknown as NlpResult;
}

describe("applyBriefOverrides — nlpTermsAdded", () => {
  it("injecte les termes custom EN TÊTE de liste (visibles dans le top 40 UI/scoring)", () => {
    // 60 termes naturels : un terme appendé en fin serait hors slice(0, 40).
    const naturals = Array.from({ length: 60 }, (_, i) => makeTerm(`naturel-${i}`));
    const out = applyBriefOverrides(
      { nlp: makeNlp(naturals), serp: [], position: null },
      { nlpTermsAdded: ["mot secondaire", "autre kw"] },
    );
    const terms = out.nlp!.nlpTerms;
    expect(terms[0].term).toBe("mot secondaire");
    expect(terms[1].term).toBe("autre kw");
    // Les customs entrent dans le top 40 effectivement affiché et scoré.
    const top40 = terms.slice(0, 40).map((t) => t.term);
    expect(top40).toContain("mot secondaire");
    expect(top40).toContain("autre kw");
    // Tier Essentiels (presence >= 70).
    expect(terms[0].presence).toBe(70);
    // Les naturels restent présents derrière.
    expect(terms).toHaveLength(62);
  });

  it("ne duplique pas un terme déjà présent dans l'analyse (case-insensitive)", () => {
    const out = applyBriefOverrides(
      { nlp: makeNlp([makeTerm("Chaussure Trail", 45)]), serp: [], position: null },
      { nlpTermsAdded: ["chaussure trail", "semelle"] },
    );
    const terms = out.nlp!.nlpTerms.map((t) => t.term);
    expect(terms).toEqual(["semelle", "Chaussure Trail"]);
  });
});
