/**
 * Bench du scoring Datafer sur les briefs de référence.
 *
 * Pour chaque brief de scripts/bench-data/, calcule :
 *  - score de chaque concurrent du top 10 (re-scorés via leur crawl déjà
 *    présent dans serp_json),
 *  - score du contenu rédigé par Pierre (editor_html),
 *  - score de 3 contenus synthétiques (vide / brouillon propre / optim).
 *
 * Sortie : tableau récap par brief + agrégat sur les 5 briefs. Sert à
 * calibrer la pondération du scoring (cible : top 10 50-65, optim 80-92,
 * vide 25-40).
 *
 * Lancement :
 *   npx tsx scripts/score-bench.ts [--brief=box-repas] [--show-detail]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { computeDetailedScore, relativizeScore, type EditorData } from "../src/lib/scoring";
import { parseHTML, type NlpResult, type NlpTerm } from "../src/lib/analysis";
import { geoSignalsFromHtml, type GeoSignals } from "../src/lib/geo-scoring";

const BENCH_DIR = path.join(__dirname, "bench-data");
const BRIEFS = [
  "box-repas",
  "bijoux-de-corps",
  "costume-homme-beige",
  "gerer-son-patrimoine",
  "nike-x-patta",
];

type BriefRow = {
  id: string;
  keyword: string;
  country: string;
  serp_json: string;
  nlp_json: string;
  editor_html: string | null;
  score: number | null;
};

type SerpResult = {
  position: number;
  title: string;
  link: string;
  text: string;
  h1: string[];
  h2: string[];
  h3: string[];
  wordCount: number;
  structuredHtml?: string;
};

function loadBrief(slug: string): BriefRow {
  const raw = fs.readFileSync(path.join(BENCH_DIR, `${slug}.json`), "utf8");
  return JSON.parse(raw);
}

function imageCountFromHtml(html: string): number {
  const matches = html.match(/<img[\s>]/gi) ?? [];
  return Math.min(matches.length, 30); // même cap que parseHTML
}

function buildEditorDataFromSerp(r: SerpResult): EditorData {
  return {
    text: r.text || "",
    h1s: r.h1 || [],
    h2s: r.h2 || [],
    h3s: r.h3 || [],
    imageCount: r.structuredHtml ? imageCountFromHtml(r.structuredHtml) : 0,
  };
}

/**
 * 3 contenus synthétiques calibrés pour tester la courbe de scoring.
 *
 * Le but : voir où chacun tape avec le scoring courant pour vérifier la
 * cohérence (vide doit être bas, optim doit être haut).
 */
function syntheticContents(nlp: NlpResult): {
  empty: { ed: EditorData; html: string };
  draft: { ed: EditorData; html: string };
  optim: { ed: EditorData; html: string };
} {
  const kw = nlp.exactKeyword.keyword;
  const targetWc = Math.round((nlp.minWordCount + nlp.maxWordCount) / 2);

  // 1) VIDE : ~200 mots de remplissage, 1 H1 hors-sujet, 0 structure.
  const fillerWord = "lorem";
  const emptyText = Array.from({ length: 220 }, () => fillerWord).join(" ");
  const empty = {
    ed: {
      text: emptyText,
      h1s: ["Page de test"],
      h2s: [],
      h3s: [],
      imageCount: 0,
    } satisfies EditorData,
    html: `<h1>Page de test</h1><p>${emptyText}</p>`,
  };

  // 2) BROUILLON PROPRE : longueur cible, H1 avec KW, qq H2, KW dans first 100,
  //    mais 0 essentiel NLP, pas de listes/tableau/FAQ.
  const draftIntro = `${kw} : voici tout ce qu'il faut savoir sur le sujet pour bien démarrer. ${kw} est une thématique qui intéresse de nombreuses personnes.`;
  const draftBody = Array.from({ length: targetWc - 50 }, () => "contenu").join(" ");
  const draftText = `${draftIntro} ${draftBody} En conclusion, ${kw} reste un bon choix.`;
  const draft = {
    ed: {
      text: draftText,
      h1s: [`Tout savoir sur ${kw}`],
      h2s: ["Présentation", "Avantages", "Conclusion"],
      h3s: [],
      imageCount: 0,
    } satisfies EditorData,
    html:
      `<h1>Tout savoir sur ${kw}</h1>` +
      `<p>${draftIntro}</p>` +
      `<h2>Présentation</h2><p>${draftBody.slice(0, 800)}</p>` +
      `<h2>Avantages</h2><p>${draftBody.slice(800, 1600)}</p>` +
      `<h2>Conclusion</h2><p>${draftBody.slice(1600)} En conclusion, ${kw} reste un bon choix.</p>`,
  };

  // 3) OPTIM SÉRIEUX : longueur cible, H1+H2 avec KW, 100% essentiels couverts,
  //    listes, FAQ, données chiffrées, table.
  const essentials = nlp.nlpTerms.filter((t) => t.presence >= 70).slice(0, 20);
  const importants = nlp.nlpTerms
    .filter((t) => t.presence >= 40 && t.presence < 70)
    .slice(0, 15);
  const allTerms = [...essentials, ...importants].map((t) => t.term);
  const optimIntro = `${kw} : guide complet pour choisir la meilleure option. Dans cet article, nous explorons ${kw} sous tous ses angles.`;
  const optimBody1 = `${kw} se décline en plusieurs formats. ${allTerms.slice(0, 10).join(", ")}. ${kw} permet de répondre à 5 besoins courants. Cela représente 30% des recherches.`;
  const optimBody2 = `Les avantages de ${kw} incluent : ${allTerms.slice(10, 20).join(", ")}. Comptez 15 minutes pour vous décider. Les utilisateurs économisent 200€ par an.`;
  const optimBody3 = `${allTerms.slice(20).join(". ")}. ${kw} reste pertinent en 2026.`;
  // Bourrage de mots pour atteindre la longueur cible
  const padding = Array.from({ length: Math.max(0, targetWc - 600) }, () => "informations").join(" ");
  const optimText = [
    optimIntro,
    optimBody1,
    optimBody2,
    optimBody3,
    padding,
    `En résumé, ${kw} mérite une attention particulière.`,
  ].join(" ");
  const optim = {
    ed: {
      text: optimText,
      h1s: [`${kw} : guide complet 2026`],
      h2s: [
        `Qu'est-ce que ${kw} ?`,
        `Comment choisir son ${kw} ?`,
        `Pourquoi opter pour ${kw} ?`,
        `FAQ ${kw}`,
      ],
      h3s: ["Critères de choix", "Comparaison", "Erreurs à éviter"],
      imageCount: 4,
    } satisfies EditorData,
    html:
      `<p><em>En bref : ${kw} est un sujet à connaître absolument. Voici les points clés.</em></p>` +
      `<h1>${kw} : guide complet 2026</h1>` +
      `<p>${optimIntro}</p>` +
      `<h2>Qu'est-ce que ${kw} ?</h2><p>${optimBody1}</p>` +
      `<ul><li>Avantage 1</li><li>Avantage 2</li><li>Avantage 3</li><li>Avantage 4</li></ul>` +
      `<h2>Comment choisir son ${kw} ?</h2><p>${optimBody2}</p>` +
      `<table><tr><th>Critère</th><th>Valeur</th></tr><tr><td>Prix</td><td>20€</td></tr></table>` +
      `<h2>Pourquoi opter pour ${kw} ?</h2><p>${optimBody3}</p>` +
      `<h2>FAQ ${kw}</h2>` +
      `<h3>Comment commencer avec ${kw} ?</h3><p>Réponse</p>` +
      `<h3>Quel budget pour ${kw} ?</h3><p>Réponse</p>` +
      `<p>${padding}</p>`,
  };

  return { empty, draft, optim };
}

type Row = {
  label: string;
  total: number;
  rel: number; // score relatif vs médiane top 10 (rempli en post-traitement)
  seo: number;
  geo: number;
  kw: number;
  nlp: number;
  len: number;
  head: number;
  place: number;
  struct: number;
  qual: number;
  img: number;
};

function scoreRow(
  label: string,
  ed: EditorData,
  nlp: NlpResult,
  geo: GeoSignals,
  competitorScores?: number[],
): Row {
  const s = computeDetailedScore(ed, nlp, geo, competitorScores);
  return {
    label,
    // s.total est maintenant le score relatif (si competitorScores fourni),
    // s.rawTotal le brut. On expose les 2 dans le bench pour visualiser.
    total: s.rawTotal,
    rel: s.total,
    seo: s.seoTotal,
    geo: s.geoTotal,
    kw: s.keyword.score,
    nlp: s.nlpCoverage.score,
    len: s.contentLength.score,
    head: s.headings.score,
    place: s.placement.score,
    struct: s.structure.score,
    qual: s.quality.score,
    img: s.images.score,
  };
}

// `relativizeScore` est maintenant importé depuis src/lib/scoring (review
// 2026-05-08, M2). Avant on en avait une copie locale qui pouvait diverger
// silencieusement de la prod.

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function fmtTable(rows: Row[]): string {
  const cols = ["label", "total", "rel", "seo", "geo", "kw", "nlp", "len", "head", "place", "struct", "qual", "img"];
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String((r as any)[c]).length)),
  );
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const fmt = (vals: any[]) =>
    vals.map((v, i) => String(v).padEnd(widths[i])).join("  ");
  return [fmt(cols), sep, ...rows.map((r) => fmt(cols.map((c) => (r as any)[c])))].join("\n");
}

function benchBrief(slug: string, showDetail: boolean): { rows: Row[]; summary: string[] } {
  const b = loadBrief(slug);
  const serp = JSON.parse(b.serp_json) as Record<string, SerpResult>;
  const nlp = JSON.parse(b.nlp_json) as NlpResult;
  // Backfill medianImages (briefs anciens sans cette colonne)
  if (nlp.medianImages == null) (nlp as any).medianImages = 0;

  const rows: Row[] = [];

  // 1) Concurrents top 10
  for (let i = 0; i < 10; i++) {
    const r = serp[String(i)];
    if (!r || !r.text || r.wordCount < 100) continue;
    const ed = buildEditorDataFromSerp(r);
    const geo = r.structuredHtml ? geoSignalsFromHtml(r.structuredHtml) : {
      hasTable: false, bulletItemsCount: 0, hasQuickSummary: false,
      faqQuestionsCount: 0, numericMentionsCount: 0,
    };
    const host = new URL(r.link).hostname.replace(/^www\./, "");
    rows.push(scoreRow(`#${i + 1} ${host}`.slice(0, 32), ed, nlp, geo));
  }

  // 2) Contenu rédigé Pierre
  if (b.editor_html) {
    const parsed = parseHTML(b.editor_html);
    const ed: EditorData = {
      text: parsed.text,
      h1s: parsed.h1,
      h2s: parsed.h2,
      h3s: parsed.h3,
      imageCount: parsed.imageCount,
    };
    const geo = geoSignalsFromHtml(b.editor_html);
    rows.push(scoreRow("PIERRE (editor_html)", ed, nlp, geo));
  }

  // 3) Contenus synthétiques
  const synth = syntheticContents(nlp);
  rows.push(scoreRow("[SYNTH] vide 220w sans optim", synth.empty.ed, nlp, geoSignalsFromHtml(synth.empty.html)));
  rows.push(scoreRow("[SYNTH] brouillon propre", synth.draft.ed, nlp, geoSignalsFromHtml(synth.draft.html)));
  rows.push(scoreRow("[SYNTH] optim sérieux", synth.optim.ed, nlp, geoSignalsFromHtml(synth.optim.html)));

  // Récupère les scores bruts des concurrents pour relativiser Pierre +
  // synth. Les concurrents eux-mêmes restent en brut (rel = 0 par défaut).
  const compRows = rows.filter((r) => r.label.startsWith("#"));
  const competitorScores = compRows.map((r) => r.total);
  const compTotals = [...competitorScores].sort((a, b) => a - b);
  const med = median(compTotals);
  // Re-score Pierre + synth avec competitorScores pour avoir le rel direct.
  // (Les concurrents gardent rel=0 dans la table car leur "rel" n'a pas
  // de sens — un concurrent vs sa propre médiane.)
  // On les re-calcule via relativizeScore pour cohérence d'affichage.
  for (const r of rows) {
    if (!r.label.startsWith("#")) r.rel = relativizeScore(r.total, med);
    else r.rel = relativizeScore(r.total, med); // info, pas utilisé en prod
  }
  const min = compTotals[0];
  const max = compTotals[compTotals.length - 1];

  const fmtScores = (r: Row | undefined) => r ? `${r.total} brut → ${r.rel} relatif` : "n/a";
  const summary = [
    `${slug} (kw: "${b.keyword}", target wc: ${nlp.minWordCount}-${nlp.maxWordCount})`,
    `  Top 10 brut : min=${min} median=${med} max=${max} (n=${compRows.length})`,
    `  Pierre   : ${fmtScores(rows.find((r) => r.label.startsWith("PIERRE")))} (saved: ${b.score})`,
    `  vide     : ${fmtScores(rows.find((r) => r.label.startsWith("[SYNTH] vide")))}`,
    `  brouillon: ${fmtScores(rows.find((r) => r.label.startsWith("[SYNTH] brouillon")))}`,
    `  optim    : ${fmtScores(rows.find((r) => r.label.startsWith("[SYNTH] optim")))}`,
  ];

  if (showDetail) {
    console.log("\n" + summary.join("\n"));
    console.log(fmtTable(rows));
  }
  return { rows, summary };
}

function main() {
  const args = process.argv.slice(2);
  const briefArg = args.find((a) => a.startsWith("--brief="))?.split("=")[1];
  const showDetail = args.includes("--show-detail");
  const slugs = briefArg ? [briefArg] : BRIEFS;

  console.log("=== Bench scoring Datafer ===");
  console.log(`Cible: vide 25-40 | top 10 moyen 50-65 | top 10 excellent 70-80 | optim 80-92`);

  const allSummaries: string[] = [];
  for (const slug of slugs) {
    const { summary } = benchBrief(slug, showDetail);
    allSummaries.push(...summary, "");
  }
  console.log("\n=== Résumé global ===");
  console.log(allSummaries.join("\n"));
}

main();
