/**
 * Scoring GEO (Generative Engine Optimization) sur 5 critères.
 *
 * Optimisation pour les moteurs génératifs (Perplexity, ChatGPT, Gemini…) :
 * un contenu bien structuré (tableaux, listes, TL;DR, FAQ, données chiffrées)
 * est plus susceptible d'être cité comme source par les LLMs.
 *
 * Les signaux sont extraits côté client à partir du HTML de l'éditeur
 * (le calcul tourne en temps réel à chaque frappe).
 */

export type GeoSignals = {
  hasTable: boolean;
  // Présence d'une liste (ul/ol) avec au moins 3 items pour qu'elle soit
  // signifiante (sinon une petite énumération in-line ne compte pas comme
  // "structure GEO").
  bulletItemsCount: number;
  hasQuickSummary: boolean;
  // Nombre de questions identifiées (H2/H3 finissant par "?" ou contenant
  // "FAQ"/"questions").
  faqQuestionsCount: number;
  // Mentions chiffrées avec unité ou contexte (5%, 1284 mots, 3 paires…).
  numericMentionsCount: number;
};

export type GeoCriterion = {
  ok: boolean;
  score: number;
  max: number;
};

export type GeoScore = {
  total: number; // /100
  table: GeoCriterion;
  bulletList: GeoCriterion;
  quickSummary: GeoCriterion;
  faq: GeoCriterion;
  statistics: GeoCriterion;
};

const CRITERION_MAX = 20; // 5 × 20 = 100

/**
 * Extrait les signaux GEO depuis le DOM de l'éditeur. Appelé chaque fois
 * que readEditor() tourne dans BriefEditor.
 */
export function extractGeoSignals(editorRoot: HTMLElement): GeoSignals {
  // 1. Table : on demande au moins une vraie ligne de données (≥1 <tr>
  //    contenant ≥1 <td>, pas seulement le header).
  const tables = editorRoot.querySelectorAll("table");
  let hasTable = false;
  for (const t of tables) {
    if (t.querySelectorAll("tbody td").length > 0 || t.querySelectorAll("td").length > 0) {
      hasTable = true;
      break;
    }
  }

  // 2. Listes : on additionne ul + ol et on garde le total des <li>.
  const bulletItemsCount = editorRoot.querySelectorAll("ul li, ol li").length;

  // 3. Quick summary : on cherche
  //    a) un paragraphe en italique parmi les 3 premiers blocs
  //    b) ou un H2/H3 qui contient "résumé" / "tldr" / "tl;dr" / "en bref"
  //       / "synthèse" / "à retenir"
  const summaryKeywords = ["résumé", "resume", "tldr", "tl;dr", "tl ; dr", "en bref", "synthèse", "synthese", "à retenir", "a retenir"];
  let hasQuickSummary = false;
  // a) paragraphe en italique en début
  const earlyBlocks = Array.from(editorRoot.children).slice(0, 3);
  for (const block of earlyBlocks) {
    if (
      block.tagName.toLowerCase() === "p" &&
      block.querySelector("em, i") &&
      (block.textContent ?? "").trim().length > 30
    ) {
      hasQuickSummary = true;
      break;
    }
  }
  // b) heading déclaratif
  if (!hasQuickSummary) {
    const headings = editorRoot.querySelectorAll("h2, h3");
    for (const h of headings) {
      const t = (h.textContent ?? "").toLowerCase();
      if (summaryKeywords.some((k) => t.includes(k))) {
        hasQuickSummary = true;
        break;
      }
    }
  }

  // 4. FAQ : ≥2 H2/H3 qui se terminent par "?" OU un H2 qui contient "faq"
  //    avec au moins 2 sous-H3.
  const headings = editorRoot.querySelectorAll("h2, h3");
  let questionHeadings = 0;
  let faqSectionFound = false;
  for (const h of headings) {
    const txt = (h.textContent ?? "").trim();
    if (txt.endsWith("?") || txt.endsWith(" ?")) questionHeadings++;
    if (h.tagName.toLowerCase() === "h2" && /\bfaq\b|questions/i.test(txt)) {
      faqSectionFound = true;
    }
  }
  // Si une section FAQ existe, on garantit au moins 2 questions « comptées ».
  const faqQuestionsCount = faqSectionFound && questionHeadings < 2 ? 2 : questionHeadings;

  // 5. Statistiques chiffrées : on cherche les patterns « <nombre> <unité> »
  //    et « <nombre>% ». 3 occurrences distinctes au minimum pour qu'on
  //    valide le critère.
  const text = editorRoot.textContent ?? "";
  const numericRegex = /\b\d+(?:[.,]\d+)?\s*(?:%|€|\$|km|kg|cm|mm|ms|m²|m2|ans?|jours?|paires?|fois|mots?|heures?|minutes?)\b/gi;
  const numericMentionsCount = (text.match(numericRegex) ?? []).length;

  return {
    hasTable,
    bulletItemsCount,
    hasQuickSummary,
    faqQuestionsCount,
    numericMentionsCount,
  };
}

/** Convertit les signaux extraits en score /100 (5 × 20). */
export function computeGeoScore(signals: GeoSignals): GeoScore {
  const table: GeoCriterion = {
    ok: signals.hasTable,
    score: signals.hasTable ? CRITERION_MAX : 0,
    max: CRITERION_MAX,
  };

  // ≥3 items pour que la liste soit "structurée" au sens GEO.
  const bulletOk = signals.bulletItemsCount >= 3;
  const bulletList: GeoCriterion = {
    ok: bulletOk,
    score: bulletOk
      ? CRITERION_MAX
      : signals.bulletItemsCount > 0
        ? Math.round((signals.bulletItemsCount / 3) * CRITERION_MAX)
        : 0,
    max: CRITERION_MAX,
  };

  const quickSummary: GeoCriterion = {
    ok: signals.hasQuickSummary,
    score: signals.hasQuickSummary ? CRITERION_MAX : 0,
    max: CRITERION_MAX,
  };

  const faqOk = signals.faqQuestionsCount >= 2;
  const faq: GeoCriterion = {
    ok: faqOk,
    score: faqOk
      ? CRITERION_MAX
      : signals.faqQuestionsCount === 1
        ? Math.round(CRITERION_MAX * 0.5)
        : 0,
    max: CRITERION_MAX,
  };

  const statsOk = signals.numericMentionsCount >= 3;
  const statistics: GeoCriterion = {
    ok: statsOk,
    score: statsOk
      ? CRITERION_MAX
      : signals.numericMentionsCount > 0
        ? Math.round((signals.numericMentionsCount / 3) * CRITERION_MAX)
        : 0,
    max: CRITERION_MAX,
  };

  const total = Math.min(
    100,
    table.score + bulletList.score + quickSummary.score + faq.score + statistics.score,
  );

  return { total, table, bulletList, quickSummary, faq, statistics };
}

/** GeoSignals neutre pour les tests / le SSR / un éditeur vide. */
export const EMPTY_GEO_SIGNALS: GeoSignals = {
  hasTable: false,
  bulletItemsCount: 0,
  hasQuickSummary: false,
  faqQuestionsCount: 0,
  numericMentionsCount: 0,
};

export const GEO_LABELS = {
  table: "Tableau structuré",
  bulletList: "Liste à puces (≥3 items)",
  quickSummary: "Quick summary / TL;DR",
  faq: "Section FAQ (≥2 questions)",
  statistics: "Données chiffrées (≥3)",
} as const;
