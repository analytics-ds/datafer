/**
 * Cohérence du scoring — garde-fous des trois correctifs du 2026-09-06 :
 *   1. un palier NLP vide ne donne plus ses points
 *   2. le même contenu donne le même score quel que soit le chemin
 *   3. les concurrents sont mesurés avec les mêmes règles que le user
 */
import { describe, it, expect } from "vitest";
import {
  competitorEditorData,
  computeDetailedScore,
  ensureAvgBlocks,
  ensureCompetitorScores,
  htmlToBlockTexts,
  kwEmphasizedFromHtml,
  refreshCompetitorScores,
  SCORING_VERSION,
  type EditorData,
} from "@/lib/scoring";
import { htmlToEditorData } from "@/lib/briefs-service";
import { extractScorableParagraphs } from "@/lib/semantic-paragraphs";
import { geoSignalsFromHtml } from "@/lib/geo-scoring";
import type { NlpResult, SerpResult } from "@/lib/analysis";

function makeNlp(terms: { term: string; presence: number }[]): NlpResult {
  return {
    exactKeyword: {
      keyword: "chaussures running",
      variations: [],
      avgCount: 8,
      idealDensityMin: 0.5,
      idealDensityMax: 2,
    },
    nlpTerms: terms,
    minWordCount: 900,
    maxWordCount: 1600,
    avgWordCount: 1200,
    avgHeadings: 8,
    avgParagraphs: 20,
    medianImages: 4,
  } as unknown as NlpResult;
}

/** Texte hors sujet : ne contient aucun terme NLP ni le mot-clé. */
const OFF_TOPIC = "Le facteur distribue le courrier chaque matin dans la vallee. ".repeat(40);
const offTopicEd: EditorData = { text: OFF_TOPIC, h1s: ["titre du jour"], h2s: [], h3s: [] };

describe("1. paliers NLP vides neutralisés", () => {
  it("les deux paliers peuplés : critère sur 22", () => {
    const s = computeDetailedScore(
      offTopicEd,
      makeNlp([
        { term: "amorti", presence: 90 },
        { term: "drop", presence: 50 },
      ]),
    );
    expect(s.nlpCoverage.max).toBe(22);
    expect(s.nlpCoverage.score).toBe(0);
  });

  it("aucun important : le critère tombe à 14, pas de 8 points offerts", () => {
    const s = computeDetailedScore(offTopicEd, makeNlp([{ term: "amorti", presence: 90 }]));
    expect(s.nlpCoverage.max).toBe(14);
    expect(s.nlpCoverage.score).toBe(0);
  });

  it("aucun essentiel : le critère tombe à 8, pas de 14 points offerts", () => {
    const s = computeDetailedScore(offTopicEd, makeNlp([{ term: "amorti", presence: 50 }]));
    expect(s.nlpCoverage.max).toBe(8);
    expect(s.nlpCoverage.score).toBe(0);
  });

  it("que des opportunités : critère entièrement neutralisé (avant : 22/22 offerts)", () => {
    const s = computeDetailedScore(
      offTopicEd,
      makeNlp([
        { term: "amorti", presence: 30 },
        { term: "drop", presence: 20 },
      ]),
    );
    expect(s.nlpCoverage.max).toBe(0);
    expect(s.nlpCoverage.score).toBe(0);
  });

  it("aucun terme du tout : critère neutralisé", () => {
    const s = computeDetailedScore(offTopicEd, makeNlp([]));
    expect(s.nlpCoverage.max).toBe(0);
    expect(s.nlpCoverage.score).toBe(0);
  });

  it("un texte hors sujet ne monte pas quand le brief n'a que des opportunités", () => {
    const withEssentials = computeDetailedScore(
      offTopicEd,
      makeNlp([
        { term: "amorti", presence: 90 },
        { term: "drop", presence: 50 },
      ]),
    );
    const onlyOpportunities = computeDetailedScore(
      offTopicEd,
      makeNlp([
        { term: "amorti", presence: 30 },
        { term: "drop", presence: 20 },
      ]),
    );
    // Le même texte hors sujet ne doit pas gagner de points parce que le
    // brief n'a pas d'essentiels. Écart mesuré avant correctif : 9 → 32.
    expect(onlyOpportunities.rawTotal).toBeLessThanOrEqual(withEssentials.rawTotal + 2);
  });

  it("la couverture reste proportionnelle quand les termes sont utilisés", () => {
    const terms = Array.from({ length: 10 }, (_, i) => ({
      term: `terme${i}`,
      presence: 90,
    }));
    const halfText = "terme0 terme1 terme2 terme3 terme4 " + OFF_TOPIC;
    const s = computeDetailedScore({ ...offTopicEd, text: halfText }, makeNlp(terms));
    expect(s.nlpCoverage.max).toBe(14);
    expect(s.nlpCoverage.details.essentialsCoverage).toBe(50);
    expect(s.nlpCoverage.score).toBe(7);
  });
});

describe("2 et 3. comptage de blocs partagé", () => {
  const html = [
    "<h1>Chaussures running : le guide complet du coureur</h1>",
    "<p>Un premier paragraphe assez long pour compter comme un vrai bloc de contenu.</p>",
    "<h2>Amorti et drop, ce qu'il faut regarder</h2>",
    "<p>Un deuxième paragraphe, également bien assez long pour être compté ici.</p>",
    "<ul><li>Premier item de liste suffisamment long</li><li>Second item de liste assez long</li></ul>",
    "<table><tr><td>Une cellule de tableau assez longue pour compter</td></tr></table>",
  ].join("\n");

  it("compte les blocs de plus de 20 caractères, titres et items inclus", () => {
    // h1 + 2 p + h2 + 2 li + 1 ligne de tableau = 7 blocs.
    const blocks = htmlToBlockTexts(html);
    expect(blocks.length).toBe(7);
    expect(blocks[0]).toContain("Chaussures running");
  });

  it("ignore les blocs trop courts et le HTML vide", () => {
    expect(htmlToBlockTexts("<p>court</p>")).toEqual([]);
    expect(htmlToBlockTexts("")).toEqual([]);
  });

  it("htmlToEditorData expose le même compte que la primitive", () => {
    expect(htmlToEditorData(html).blockCount).toBe(htmlToBlockTexts(html).length);
  });

  it("un concurrent au texte aplati garde son vrai nombre de blocs", () => {
    // extractContent aplatit le texte concurrent en une seule ligne : c'est
    // ce qui donnait 1/6 en structure à tous les concurrents.
    const flatText = htmlToBlockTexts(html).join(" ");
    const competitor = {
      text: flatText,
      structuredHtml: html,
      h1: ["Chaussures running : le guide complet du coureur"],
      h2: ["Amorti et drop, ce qu'il faut regarder"],
      h3: [],
      imageCount: 0,
    } as unknown as SerpResult;

    const ed = competitorEditorData(competitor, "chaussures running");
    expect(ed.blockCount).toBe(7);

    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    const geo = geoSignalsFromHtml(html);
    const compScore = computeDetailedScore(ed, nlp, geo);
    const userScore = computeDetailedScore(htmlToEditorData(html), nlp, geo);

    // Même contenu : même critère structure des deux côtés.
    expect(compScore.structure.score).toBe(userScore.structure.score);
    expect(compScore.structure.details.paragraphs).toBe(
      userScore.structure.details.paragraphs,
    );
  });

  it("sans blockCount, on retombe sur l'ancien comportement (rétro-compat)", () => {
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    const legacy = computeDetailedScore(
      { text: "bloc un assez long pour compter\n\nbloc deux assez long aussi", h1s: [], h2s: [], h3s: [] },
      nlp,
    );
    expect(legacy.structure.details.paragraphs).toBe(2);
  });
});

describe("3. référence de structure et estampille de formule", () => {
  const html = [
    "<h1>Chaussures running, le comparatif complet</h1>",
    "<h2>Amorti et drop, ce qu'il faut savoir</h2>",
    "<p>Un paragraphe de contenu assez long pour compter comme un bloc entier.</p>",
    "<p>Un second paragraphe, lui aussi assez long pour compter comme un bloc.</p>",
    "<ul><li>Un item de liste assez long pour compter</li><li>Un autre item assez long</li></ul>",
  ].join("");

  function serpJson(): string {
    return JSON.stringify([
      {
        position: 1,
        link: "https://a.fr",
        text: htmlToBlockTexts(html).join(" "),
        structuredHtml: html,
        h1: ["Chaussures running, le comparatif complet"],
        h2: ["Amorti et drop, ce qu'il faut savoir"],
        h3: [],
        wordCount: 400,
        imageCount: 1,
      },
    ]);
  }

  it("ensureAvgBlocks calcule la référence depuis le HTML des concurrents", () => {
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    expect(nlp.avgBlocks).toBeUndefined();
    const ref = ensureAvgBlocks(nlp, serpJson());
    expect(ref).toBe(htmlToBlockTexts(html).length);
    expect(nlp.avgBlocks).toBe(ref);
  });

  it("le critère structure prend avgBlocks quand il existe, avgParagraphs sinon", () => {
    const ed = htmlToEditorData(html);
    const legacy = computeDetailedScore(ed, makeNlp([{ term: "amorti", presence: 90 }]));
    expect(legacy.structure.details.target).toBe(20); // avgParagraphs du fixture

    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    ensureAvgBlocks(nlp, serpJson());
    const fixed = computeDetailedScore(ed, nlp);
    // h1 + h2 + 2 p + 2 li = 6 blocs chez le concurrent.
    expect(fixed.structure.details.target).toBe(6);
    // Contenu calé sur la structure du concurrent : le ratio vaut 1.
    expect(fixed.structure.details.ratio).toBe(1);
    expect(fixed.structure.score).toBeGreaterThan(legacy.structure.score);
  });

  it("recalcule les scores concurrents quand ils viennent d'une formule antérieure", () => {
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    nlp.competitorScores = [42];
    nlp.scoringVersion = SCORING_VERSION - 1;
    const scores = ensureCompetitorScores(nlp, serpJson());
    expect(scores).not.toEqual([42]);
    expect(nlp.scoringVersion).toBe(SCORING_VERSION);
  });

  it("réutilise les scores concurrents produits par la formule courante", () => {
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    nlp.competitorScores = [42];
    nlp.scoringVersion = SCORING_VERSION;
    expect(ensureCompetitorScores(nlp, serpJson())).toEqual([42]);
  });

  it("réécrit le score sur chaque row du SERP, pas seulement dans nlp", () => {
    // computeCompetitorStats lit le `score` des rows : sans réécriture, le
    // `best` à battre restait figé sur l'ancienne formule.
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    nlp.competitorScores = [42];
    nlp.scoringVersion = SCORING_VERSION - 1;
    const refreshed = refreshCompetitorScores(nlp, serpJson());
    expect(refreshed).not.toBeNull();
    expect(refreshed!.serp[0].score).toBe(refreshed!.scores[0]);
    expect(refreshed!.scores[0]).not.toBe(42);
    expect(nlp.scoringVersion).toBe(SCORING_VERSION);
  });

  it("score le concurrent sur avgBlocks quand la référence est déjà backfillée", () => {
    // Garde-fou d'ordre d'appel : ensureAvgBlocks doit tourner AVANT le
    // rafraîchissement, sinon les concurrents sont recalculés sur
    // avgParagraphs (décompte de <p>) et restent sous-évalués.
    const sansRef = makeNlp([{ term: "amorti", presence: 90 }]);
    sansRef.scoringVersion = SCORING_VERSION - 1;
    const scoreSansRef = refreshCompetitorScores(sansRef, serpJson())!.scores[0];

    const avecRef = makeNlp([{ term: "amorti", presence: 90 }]);
    avecRef.scoringVersion = SCORING_VERSION - 1;
    ensureAvgBlocks(avecRef, serpJson());
    const scoreAvecRef = refreshCompetitorScores(avecRef, serpJson())!.scores[0];

    expect(scoreAvecRef).toBeGreaterThan(scoreSansRef);
  });

  it("ne rafraîchit rien quand la formule est déjà à jour", () => {
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    nlp.competitorScores = [42];
    nlp.scoringVersion = SCORING_VERSION;
    expect(refreshCompetitorScores(nlp, serpJson())).toBeNull();
  });

  it("ne rafraîchit rien quand aucun concurrent n'est exploitable", () => {
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    // wordCount sous le seuil de 50 : page mal crawlée, non scorable.
    const thin = JSON.stringify([{ position: 1, text: "court", wordCount: 3 }]);
    expect(refreshCompetitorScores(nlp, thin)).toBeNull();
    expect(refreshCompetitorScores(nlp, "pas du json")).toBeNull();
  });

  it("garde les anciens scores si le SERP ne permet pas de recalculer", () => {
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    nlp.competitorScores = [42];
    nlp.scoringVersion = SCORING_VERSION - 1;
    expect(ensureCompetitorScores(nlp, null)).toEqual([42]);
    expect(ensureCompetitorScores(nlp, "[]")).toEqual([42]);
  });
});

describe("2. saillance détectable sans DOM", () => {
  const kw = "chaussures running";

  it("détecte le mot-clé en gras à sa première mention", () => {
    expect(
      kwEmphasizedFromHtml("<p>Les <strong>chaussures running</strong> comptent.</p>", kw),
    ).toBe(true);
    expect(kwEmphasizedFromHtml("<p>Les <em>chaussures running</em> comptent.</p>", kw)).toBe(
      true,
    );
  });

  it("renvoie false quand la première mention n'est pas mise en avant", () => {
    expect(
      kwEmphasizedFromHtml(
        "<p>Les chaussures running comptent. Les <strong>chaussures running</strong> aussi.</p>",
        kw,
      ),
    ).toBe(false);
  });

  it("ignore les titres : le mot-clé en H1 n'est pas de la saillance", () => {
    expect(
      kwEmphasizedFromHtml("<h1><strong>chaussures running</strong></h1><p>Du texte ici.</p>", kw),
    ).toBe(false);
  });

  it("renvoie false quand le mot-clé est absent du corps", () => {
    expect(kwEmphasizedFromHtml("<p>Un texte sans le sujet du brief.</p>", kw)).toBe(false);
  });

  it("ne se prononce pas sur un corps vide ou sans mot-clé fourni", () => {
    expect(kwEmphasizedFromHtml("<h1>Titre seul</h1>", kw)).toBeUndefined();
    expect(kwEmphasizedFromHtml("<p>Du texte.</p>", "")).toBeUndefined();
  });

  it("gère les entités et les balises imbriquées", () => {
    expect(
      kwEmphasizedFromHtml(
        "<p>Des&nbsp;<strong><em>chaussures running</em></strong> testées.</p>",
        kw,
      ),
    ).toBe(true);
  });

  it("alimente le critère saillance côté scoring", () => {
    const html = "<p>Les <strong>chaussures running</strong> demandent un amorti adapté.</p>";
    const nlp = makeNlp([{ term: "amorti", presence: 90 }]);
    const ed = htmlToEditorData(html);
    const withSalience = computeDetailedScore(
      { ...ed, kwEmphasized: kwEmphasizedFromHtml(html, nlp.exactKeyword.keyword) },
      nlp,
    );
    expect(withSalience.salience.max).toBe(4);
    expect(withSalience.salience.score).toBe(4);
    // Sans l'information, le critère reste neutralisé.
    expect(computeDetailedScore(ed, nlp).salience.max).toBe(0);
  });
});

describe("2. paragraphes scorables côté serveur", () => {
  it("prend les p, ul et ol d'au moins 5 mots", () => {
    const html = [
      "<h1>Un titre qui ne doit pas être embeddé</h1>",
      "<p>Un paragraphe de plus de cinq mots pour être scoré.</p>",
      "<p>court</p>",
      "<ul><li>Premier item</li><li>Deuxième item de la liste</li></ul>",
      "<ol><li>Un item numéroté assez long</li></ol>",
    ].join("\n");
    const out = extractScorableParagraphs(html);
    expect(out.length).toBe(3);
    expect(out[0]).toContain("Un paragraphe de plus de cinq mots");
    // La liste est agrégée en un seul bloc, pas une puce par puce.
    expect(out[1]).toBe("Premier item Deuxième item de la liste");
  });

  it("cappe un paragraphe trop long à 1500 caractères", () => {
    const long = "mot ".repeat(2000);
    const out = extractScorableParagraphs(`<p>${long}</p>`);
    expect(out[0].length).toBe(1500);
  });

  it("renvoie un tableau vide sur un HTML sans bloc scorable", () => {
    expect(extractScorableParagraphs("<h2>Titre</h2>")).toEqual([]);
    expect(extractScorableParagraphs("")).toEqual([]);
  });
});
