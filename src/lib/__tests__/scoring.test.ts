import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  relativizeScore,
  medianCompetitorScore,
  computeDetailedScore,
  type EditorData,
} from "@/lib/scoring";
import type { NlpResult } from "@/lib/analysis";

describe("relativizeScore", () => {
  it("retourne le brut quand la médiane concurrente est nulle ou négative", () => {
    expect(relativizeScore(70, 0)).toBe(70);
    expect(relativizeScore(70, -5)).toBe(70);
  });

  it("place un brut égal à la référence à 50", () => {
    // ref = max(60, 60) = 60, rawTotal >= ref => 50 + 50*0
    expect(relativizeScore(60, 60)).toBe(50);
  });

  it("place un brut à ref*1.5 à 100", () => {
    // ref = 60, rawTotal 90 = 60*1.5 => 100
    expect(relativizeScore(90, 60)).toBe(100);
  });

  it("applique le floor de médiane à 60", () => {
    // médiane 53 < 60 => ref = 60. brut 72 => 50 + 50*((72-60)/30) = 70
    expect(relativizeScore(72, 53)).toBe(70);
  });

  it("scale linéairement sous la référence", () => {
    // ref = 60, brut 30 => round(50 * 30/60) = 25
    expect(relativizeScore(30, 60)).toBe(25);
  });

  it("cappe à 100", () => {
    expect(relativizeScore(200, 60)).toBe(100);
  });

  it("utilise la médiane réelle quand elle dépasse le floor", () => {
    // médiane 80 > 60 => ref = 80. brut 40 < 80 => round(50*40/80) = 25
    expect(relativizeScore(40, 80)).toBe(25);
  });
});

describe("medianCompetitorScore", () => {
  it("retourne 0 sur une liste vide", () => {
    expect(medianCompetitorScore([])).toBe(0);
  });

  it("retourne 0 quand tous les scores sont sous le seuil d'outlier (25)", () => {
    expect(medianCompetitorScore([10, 20, 24])).toBe(0);
  });

  it("calcule la médiane sur un nombre impair de valeurs valides", () => {
    expect(medianCompetitorScore([50, 60, 70])).toBe(60);
  });

  it("calcule la médiane (moyenne arrondie) sur un nombre pair", () => {
    expect(medianCompetitorScore([40, 60])).toBe(50);
  });

  it("écarte les outliers < 25 avant de calculer", () => {
    // 10 écarté => médiane de [50, 60, 70] = 60
    expect(medianCompetitorScore([10, 50, 60, 70])).toBe(60);
  });

  it("ne trie pas en place le tableau d'entrée", () => {
    const input = [70, 50, 60];
    medianCompetitorScore(input);
    expect(input).toEqual([70, 50, 60]);
  });
});

describe("computeDetailedScore", () => {
  const nlp = loadNlpFixture();

  it("ne crash pas et retourne une structure complète quand nlp est null", () => {
    const ed: EditorData = { text: "Un peu de texte.", h1s: [], h2s: [], h3s: [] };
    const s = computeDetailedScore(ed, null);
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.rawTotal).toBeGreaterThanOrEqual(0);
    expect(s.rawTotal).toBeLessThanOrEqual(100);
    const criteria = [
      s.keyword,
      s.nlpCoverage,
      s.contentLength,
      s.headings,
      s.placement,
      s.structure,
      s.quality,
      s.images,
      s.semantic,
    ];
    for (const crit of criteria) {
      expect(crit.score).toBeGreaterThanOrEqual(0);
      expect(crit.score).toBeLessThanOrEqual(crit.max);
    }
  });

  it("neutralise le critère sémantique quand aucun score paragraphe n'est fourni", () => {
    const ed: EditorData = {
      text: "Voici un texte de test suffisamment long pour déclencher le scoring.",
      h1s: [],
      h2s: [],
      h3s: [],
    };
    const s = computeDetailedScore(ed, nlp);
    expect(s.semantic.max).toBe(0);
  });

  it("score un contenu vide plus bas qu'un contenu optimisé", () => {
    const empty: EditorData = {
      text: Array.from({ length: 200 }, () => "lorem").join(" "),
      h1s: ["Page de test"],
      h2s: [],
      h3s: [],
    };
    const kw = nlp.exactKeyword.keyword;
    const essentials = nlp.nlpTerms
      .filter((t) => t.presence >= 70)
      .slice(0, 20)
      .map((t) => t.term);
    const optimText =
      `${kw} : guide complet pour bien choisir. ${kw} est un sujet essentiel. ` +
      `${essentials.join(", ")}. ` +
      `${Array.from({ length: 600 }, () => "information").join(" ")}. ` +
      `En conclusion, ${kw} mérite votre attention.`;
    const optim: EditorData = {
      text: optimText,
      h1s: [`${kw} : guide complet`],
      h2s: [`Qu'est-ce que ${kw} ?`, `Comment choisir ${kw}`, `Pourquoi ${kw}`],
      h3s: ["Critères de choix", "Comparaison"],
      imageCount: 4,
    };
    const sEmpty = computeDetailedScore(empty, nlp);
    const sOptim = computeDetailedScore(optim, nlp);
    expect(sOptim.rawTotal).toBeGreaterThan(sEmpty.rawTotal);
  });

  it("calcule une médiane concurrente quand des scores concurrents sont fournis", () => {
    const ed: EditorData = {
      text: "Voici un texte de test un peu plus long pour passer le seuil minimal de mots.",
      h1s: [],
      h2s: [],
      h3s: [],
    };
    const s = computeDetailedScore(ed, nlp, undefined, [55, 60, 65, 70]);
    // medianCompetitorScore([55,60,65,70]) = round((60+65)/2) = 63
    expect(s.competitorMedian).toBe(63);
    expect(typeof s.total).toBe("number");
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });
});

/** Charge un NlpResult réel depuis les fixtures du bench de scoring. */
function loadNlpFixture(): NlpResult {
  const p = path.join(
    process.cwd(),
    "scripts/bench-data/costume-homme-beige.json",
  );
  const brief = JSON.parse(fs.readFileSync(p, "utf8")) as { nlp_json: string };
  const nlp = JSON.parse(brief.nlp_json) as NlpResult;
  // Briefs anciens : medianImages peut être absent (cf. score-bench.ts).
  if (nlp.medianImages == null) {
    (nlp as { medianImages: number }).medianImages = 0;
  }
  return nlp;
}
