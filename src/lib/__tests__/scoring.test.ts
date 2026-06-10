import { describe, it, expect } from "vitest";
import {
  relativizeScore,
  medianCompetitorScore,
  computeDetailedScore,
  type EditorData,
} from "@/lib/scoring";
import type { NlpResult, NlpTerm } from "@/lib/analysis";

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
  const nlp = makeNlp();

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

  describe("critère sémantique (mapping recalibré 2026-05-20)", () => {
    const ed: EditorData = {
      text: "Voici un texte de test suffisamment long pour déclencher le scoring sémantique.",
      h1s: [],
      h2s: [],
      h3s: [],
    };
    const semScoreFor = (avg: number): number =>
      computeDetailedScore(ed, nlp, undefined, undefined, [{ score: avg }])
        .semantic.score;

    it("plafonne à 10 dès 0.78 de cosinus moyen", () => {
      expect(semScoreFor(0.78)).toBe(10);
      expect(semScoreFor(0.85)).toBe(10);
    });

    it("donne 7/10 à 0.68 et 5/10 à 0.60 (zone réaliste relevée)", () => {
      expect(semScoreFor(0.68)).toBe(7);
      expect(semScoreFor(0.6)).toBe(5);
    });

    it("donne 3/10 à 0.50 et 1/10 à 0.40", () => {
      expect(semScoreFor(0.5)).toBe(3);
      expect(semScoreFor(0.4)).toBe(1);
    });

    it("tombe à 0 sous 0.32", () => {
      expect(semScoreFor(0.3)).toBe(0);
      expect(semScoreFor(0.1)).toBe(0);
    });

    it("active le critère (max=10) quand des scores paragraphe sont fournis", () => {
      const s = computeDetailedScore(ed, nlp, undefined, undefined, [{ score: 0.7 }]);
      expect(s.semantic.max).toBe(10);
      expect(s.semantic.details.avgCosine).toBe(0.7);
    });
  });
});

/** NlpTerm minimal pour les fixtures de test. */
function term(
  t: string,
  presence: number,
  avgCount = 3,
  inHeadings = false,
): NlpTerm {
  return {
    term: t,
    score: presence / 10,
    presence,
    df: Math.round((presence / 100) * 10),
    inHeadings,
    minCount: 1,
    maxCount: avgCount + 2,
    avgCount,
  };
}

/**
 * Construit un NlpResult minimal mais valide pour tester computeDetailedScore.
 * Inline (pas de fixture filesystem) : les dumps scripts/bench-data/*.json
 * sont gitignorés et indisponibles dans le CI.
 */
function makeNlp(): NlpResult {
  return {
    exactKeyword: {
      keyword: "costume homme beige",
      variations: ["costumes homme beige", "costume beige homme"],
      avgCount: 8,
      avgDensity: 0.6,
      idealDensityMin: 0.3,
      idealDensityMax: 1.2,
      inH1Pct: 70,
      inH2Pct: 40,
      inFirst100Pct: 80,
    },
    nlpTerms: [
      term("coupe", 90, 6, true),
      term("tissu", 85, 5, true),
      term("laine", 80, 4),
      term("mariage", 78, 4, true),
      term("veste", 75, 5),
      term("pantalon", 72, 4),
      term("élégance", 70, 3),
      term("morphologie", 60, 3),
      term("accessoires", 55, 2),
      term("entretien", 48, 2),
      term("couleur", 45, 3),
      term("cérémonie", 42, 2),
      term("budget", 30, 1),
      term("tendance", 25, 1),
      term("saison", 20, 1),
    ],
    avgWordCount: 1200,
    avgHeadings: 8,
    avgParagraphs: 18,
    minWordCount: 900,
    maxWordCount: 1600,
    medianImages: 4,
  };
}

describe("isJunkNlpTerm + scoring nlpCoverage", () => {
  it("identifie les termes junk (interrogatifs, articles, variantes du KW)", async () => {
    const { isJunkNlpTerm } = await import("@/lib/scoring");
    expect(isJunkNlpTerm("quelle", "laver un jean")).toBe(true);
    expect(isJunkNlpTerm("faut-il", "laver un jean")).toBe(true);
    expect(isJunkNlpTerm("deux", "laver un jean")).toBe(true);
    expect(isJunkNlpTerm("jean", "laver un jean")).toBe(true);
    expect(isJunkNlpTerm("jeans", "laver un jean")).toBe(true);
    expect(isJunkNlpTerm("denim", "laver un jean")).toBe(false);
    expect(isJunkNlpTerm("basse température", "laver un jean")).toBe(false);
    // les formes accentuées doivent être junk aussi (normalize strip les accents)
    expect(isJunkNlpTerm("où", "laver un jean")).toBe(true);
    expect(isJunkNlpTerm("très", "laver un jean")).toBe(true);
  });
});

describe("critère images neutralisé (itération 9)", () => {
  it("images vaut toujours 0/0 et n'influence pas le total", async () => {
    const { computeDetailedScore } = await import("@/lib/scoring");
    const ed = {
      text: "Contenu de test avec assez de mots pour un scoring minimal. ".repeat(20),
      h1s: ["Titre"],
      h2s: ["Sous-titre"],
      h3s: [],
      imageCount: 12,
    };
    const s = computeDetailedScore(ed, null);
    expect(s.images.max).toBe(0);
    expect(s.images.score).toBe(0);
  });
});
