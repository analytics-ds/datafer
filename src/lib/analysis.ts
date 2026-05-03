/**
 * Analyse complète d'un mot-clé : SERPAPI → crawl top 10 → TF-IDF + benchmarks → Haloscan.
 *
 * Portée depuis le HTML original (seo-forge-v4.html) avec quelques diffs :
 *   - `parseHTML` utilise htmlparser2 (SAX) au lieu de DOMParser, et filtre
 *     les zones non-éditoriales (nav/aside/sidebar/cookie/etc.) pour ne
 *     garder que le contenu utile à la NLP.
 *   - Les appels HTTP sont directs (pas de proxy CORS, on est server-side).
 */

import { Parser } from "htmlparser2";

export type Heading = { level: 1 | 2 | 3; text: string };

export type SerpResult = {
  position: number;
  title: string;
  link: string;
  snippet: string;
  displayed_link: string;
  wordCount?: number;
  headings?: number;
  paragraphs?: number;
  h1?: string[];
  h2?: string[];
  h3?: string[];
  // Plan complet dans l'ordre du document (H1 → H2 → H3 → H2 → ...).
  outline?: Heading[];
  // Score SEO /100 du concurrent (même algo que celui appliqué à la rédaction
  // côté éditeur). Calculé une fois au moment de la création du brief.
  score?: number;
  // Nombre d'images dans le contenu éditorial du concurrent (cap à 30, hors
  // zones noise). Sert au breakdown détaillé "Images" côté UI compétiteur.
  imageCount?: number;
  // Texte brut extrait de la page concurrente (sans markup). Persisté dans
  // serpJson uniquement pour les briefs créés à partir de l'API V2 (briefs
  // antérieurs : champ undefined).
  text?: string;
  // HTML reconstitué (H1/H2/H3/P dans l'ordre du document original). Permet
  // une comparaison visuelle directe avec la rédaction sans re-crawler.
  structuredHtml?: string;
};

export type Paa = { question: string; snippet: string; link: string };

export type PageContent = {
  text: string;
  h1: string[];
  h2: string[];
  h3: string[];
  outline: Heading[];
  headings: number;
  paragraphs: number;
  wordCount: number;
  // Nombre d'images dans le contenu éditorial (hors nav/footer/sidebar/
  // zones noise). Cap dur à 30 par page pour éviter les outliers e-commerce
  // (listings produits) qui feraient exploser la médiane concurrentielle.
  imageCount: number;
  // Reconstitution simple du contenu scrapé en HTML balisé. Conserve
  // l'ordre du document original (H1, P, H2, P, H3, P…) pour qu'on
  // puisse l'afficher en éditeur ou faire des comparaisons concurrentielles.
  structuredHtml: string;
};

export type NlpTerm = {
  term: string;
  // Variantes morphologiques de la même famille (unigrammes uniquement) :
  // ex. pour "travaux" on regroupe [travaux, travail, travaille, travaillé].
  // Utilisé pour le matching dans l'éditeur afin de ne pas forcer la forme
  // exacte du chip.
  variants?: string[];
  score: number;
  presence: number;
  df: number;
  inHeadings: boolean;
  // Distribution d'occurrences chez les concurrents qui utilisent le terme.
  // `minCount` et `maxCount` sont observés sur les pages qui contiennent le
  // terme (la page la moins fournie l'emploie X fois, la plus fournie Y fois).
  minCount: number;
  maxCount: number;
  avgCount: number;
  // Similarité cosinus avec le keyword principal (0-1), calculée via
  // embeddings Workers AI bge-m3. Présent uniquement si enrichWithSemantic()
  // a été exécuté (binding AI dispo). Permet de re-ranker les termes par
  // pertinence sémantique réelle plutôt que juste par fréquence.
  semanticScore?: number;
};

/**
 * Cluster thématique de nlpTerms regroupés par similarité d'embedding. Aide
 * l'utilisateur à voir d'un coup d'œil les "champs lexicaux" présents dans
 * la SERP (couleurs, marques, prix, technique, etc.) au lieu d'une liste
 * plate de 60 termes.
 */
export type SemanticCluster = {
  // Label du cluster = le terme le plus représentatif (le seed du cluster).
  label: string;
  terms: string[];
};

/**
 * Opportunité de différentiation : question PAA (People Also Ask) ou angle
 * peu couvert par les concurrents. Donne au rédacteur des sujets à traiter
 * qui ne sont PAS déjà saturés par la concurrence — vraie opportunité SEO.
 */
export type Opportunity = {
  type: "paa";
  // La question PAA elle-même (utilisable comme H2 dans le brief).
  text: string;
  // Pourcentage de concurrents qui couvrent cette question (faible = bon).
  competitorCoverage: number;
};

/**
 * Sous-partie du mot-clé principal à placer dans la rédaction. Calculé en plus
 * de `nlpTerms` pour garantir que l'utilisateur voit explicitement les
 * occurrences attendues du keyword exact, de chacun de ses mots constitutifs
 * et de ses bigrammes consécutifs (ex. pour "chaussure pas cher" : exact +
 * "chaussure" + "cher" + "pas cher").
 */
export type KeywordTerm = {
  term: string;
  // "exact"     = keyword complet
  // "part"      = sous-partie du keyword (mot ou bigramme)
  // "extension" = forme étendue détectée auto dans la SERP (ex: "asics
  //               gel-kayano" pour le keyword "kayano 14")
  kind: "exact" | "part" | "extension";
  presence: number;
  inHeadings: boolean;
  minCount: number;
  maxCount: number;
  avgCount: number;
};

/**
 * Intent de recherche détecté pour le keyword. Permet au rédacteur de savoir
 * dans quel mode rédiger (article informatif, fiche produit, comparatif...).
 */
export type Intent =
  | "transactional"
  | "informational"
  | "commercial"
  | "navigational"
  | "local";

/**
 * Sous-thème détecté dans la SERP : dérivé du clustering des H2/H3 des
 * concurrents. Indique le nombre de concurrents qui traitent ce thème.
 */
export type Section = {
  label: string;
  // Nombre de concurrents qui couvrent ce thème (≥1 H2/H3 le contenant).
  hits: number;
  total: number;
  sampleHeadings: string[];
  // Termes-clés qui identifient le thème (utilisés pour détecter si le
  // contenu utilisateur couvre ce thème).
  keyTerms: string[];
};

/**
 * Entité nommée détectée dans le top 10 (marque, organisme, loi, produit).
 * Heuristique sans IA : on repère les tokens capitalisés au milieu d'une
 * phrase et les acronymes (2-5 lettres majuscules), puis on garde ceux cités
 * par au moins 30 % des concurrents.
 */
export type Entity = {
  label: string;
  hits: number;
  total: number;
  // Nombre d'occurrences totales dans les concurrents qui la mentionnent.
  totalOccurrences: number;
};

export type NlpResult = {
  exactKeyword: {
    keyword: string;
    variations: string[];
    avgCount: number;
    avgDensity: number;
    idealDensityMin: number;
    idealDensityMax: number;
    inH1Pct: number;
    inH2Pct: number;
    inFirst100Pct: number;
  };
  // Intent de recherche détecté (transactional, informational, commercial,
  // navigational, local). Permet au rédacteur d'adapter le ton et l'angle.
  intent?: Intent;
  // Mot-clé principal éclaté en sous-parties à placer absolument dans la
  // rédaction (ne fait pas doublon avec nlpTerms, qui exclut les variantes du
  // keyword pour ne pas polluer les suggestions sémantiques).
  keywordTerms?: KeywordTerm[];
  nlpTerms: NlpTerm[];
  // Groupes thématiques détectés via embeddings Workers AI. Présent
  // uniquement si enrichWithSemantic() a été exécuté avec un binding AI.
  semanticClusters?: SemanticCluster[];
  // Questions PAA peu couvertes par les concurrents : opportunités d'angles
  // de différentiation pour le rédacteur.
  opportunities?: Opportunity[];
  sections?: Section[];
  entities?: Entity[];
  avgWordCount: number;
  avgHeadings: number;
  avgParagraphs: number;
  minWordCount: number;
  maxWordCount: number;
  // Médiane du nombre d'images chez les concurrents valides du top 10.
  // Médiane plutôt que moyenne pour résister aux outliers e-commerce
  // (un listing produits qui pousse la moyenne à 25 alors que la majorité
  // des concurrents sont à 4-6 images).
  medianImages: number;
};

// ─── SERP providers (CrazySerp + SerpAPI) ────────────────────────────────────
//
// On supporte deux providers pour pouvoir basculer entre les essais gratuits.
// Le choix se fait via la variable d'env `SERP_PROVIDER` :
//   - "crazyserp" (par défaut) : utilise CRAZYSERP_KEY
//   - "serpapi"                : utilise SERPAPI_KEY
//
// CrazySerp est ~150× moins cher mais limité aux crédits dispo. SerpAPI
// reste utile pour les jours où on dépasse le quota CrazySerp.

export type SerpProvider = "crazyserp" | "serpapi";

export async function fetchSerp(
  keyword: string,
  country: string,
  apiKey: string,
  provider: SerpProvider = "crazyserp",
  apiKeyFallback?: string,
): Promise<{ results: SerpResult[]; allResults: SerpResult[]; paa: Paa[] }> {
  if (provider === "serpapi") {
    return fetchSerpFromSerpapi(keyword, country, apiKey);
  }
  return fetchSerpFromCrazyserp(keyword, country, apiKey, apiKeyFallback);
}

// ─── CrazySerp ───────────────────────────────────────────────────────────────
// GET https://crazyserp.com/api/search?q=...&page=1&location=France
// Header : `Authorization: Bearer <CRAZYSERP_KEY>`
// 1 page = 1 crédit. -50% sur les requêtes France.

type CrazySerpOrganic = {
  position?: number;
  url?: string;
  title?: string;
  description?: string;
  url_title?: string;
  is_video?: boolean;
};

type CrazySerpResponse = {
  success?: boolean;
  parsed_data?: {
    organic?: CrazySerpOrganic[];
    people_also_ask?: Array<{ question?: string; answer?: string }>;
  };
  error?: string;
};

const COUNTRY_TO_LOCATION: Record<string, string> = {
  fr: "France",
  us: "United States",
  uk: "United Kingdom",
  gb: "United Kingdom",
  de: "Germany",
  es: "Spain",
  it: "Italy",
};

// Langue principale du pays. Sans `hl` explicite, CrazySerp utilise hl=en
// par défaut même avec location=France → SERP en mix US/EN.
const COUNTRY_TO_LANG: Record<string, string> = {
  fr: "fr",
  us: "en",
  uk: "en",
  gb: "en",
  de: "de",
  es: "es",
  it: "it",
};

// Code Google Domain par pays. Sinon CrazySerp tape google.com par défaut,
// ce qui ramène en priorité des résultats US.
const COUNTRY_TO_GOOGLE_DOMAIN: Record<string, string> = {
  fr: "google.fr",
  us: "google.com",
  uk: "google.co.uk",
  gb: "google.co.uk",
  de: "google.de",
  es: "google.es",
  it: "google.it",
};

async function fetchCrazyserpPage(
  keyword: string,
  country: string,
  apiKey: string,
  page: number,
): Promise<CrazySerpResponse | null> {
  const cc = country.toLowerCase();
  const location = COUNTRY_TO_LOCATION[cc] ?? "France";
  const lang = COUNTRY_TO_LANG[cc] ?? "fr";
  const googleDomain = COUNTRY_TO_GOOGLE_DOMAIN[cc] ?? "google.fr";
  const params = new URLSearchParams({
    q: keyword,
    page: String(page),
    pageOffset: "0",
    location,
    // Sans gl + hl + googleDomain explicites, CrazySerp défaut sur gl=us
    // / hl=en / google.com même avec location=France → SERP US-biased.
    // (Bug fix 2026-05-02 remonté par Pierre sur "tshirt blanc" qui
    // ramenait H&M /en_us/, Amazon.com etc. au lieu de Kiabi, Celio, etc.)
    gl: cc === "uk" || cc === "gb" ? "uk" : cc,
    hl: lang,
    googleDomain,
  });
  const url = `https://crazyserp.com/api/search?${params.toString()}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) return null;
  const d = (await r.json()) as CrazySerpResponse;
  if (!d.success) return null;
  return d;
}

async function fetchSerpFromCrazyserp(
  keyword: string,
  country: string,
  apiKey: string,
  apiKeyFallback?: string,
): Promise<{ results: SerpResult[]; allResults: SerpResult[]; paa: Paa[] }> {
  // Page 1 = 1 crédit. Renvoie ~10 résultats organiques (parfois 8-9 si
  // Google a inséré des blocs spéciaux).
  let first = await fetchCrazyserpPage(keyword, country, apiKey, 1);
  // Bascule automatique sur la clé secondaire si la primaire ne répond pas
  // (cas typique : quota CrazySerp épuisé sur la primaire). Pierre voit
  // [crazyserp] fallback dans les logs Cloudflare et sait qu'il faut
  // recharger la primaire.
  let activeKey = apiKey;
  if (!first && apiKeyFallback) {
    console.log("[crazyserp] primary key failed, trying fallback");
    first = await fetchCrazyserpPage(keyword, country, apiKeyFallback, 1);
    if (first) {
      activeKey = apiKeyFallback;
      console.log("[crazyserp] using fallback key for this brief");
    }
  }
  if (!first) return { results: [], allResults: [], paa: [] };

  const pd = first.parsed_data ?? {};
  let allOrganic = pd.organic ?? [];

  const paa: Paa[] = (pd.people_also_ask ?? []).map((q) => ({
    question: q.question ?? "",
    snippet: q.answer ?? "",
    link: "",
  }));

  // CrazySerp : `page=N` est cumulatif et coûte N crédits. Si on a <10
  // organiques sur la page 1 (Google insère souvent des blocs spéciaux),
  // on demande directement la page 2 (2 crédits, ~17 organiques) pour
  // garantir le top 10 complet. On utilise activeKey pour rester cohérent
  // avec la 1re page (utile si on est passé en fallback).
  if (allOrganic.length < 10) {
    const next = await fetchCrazyserpPage(keyword, country, activeKey, 2);
    if (next) {
      const more = next.parsed_data?.organic ?? [];
      if (more.length > allOrganic.length) {
        allOrganic = more;
      }
    }
  }

  const allResults: SerpResult[] = allOrganic.map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title ?? "",
    link: r.url ?? "",
    snippet: r.description ?? "",
    displayed_link: r.url_title ?? r.url ?? "",
  }));
  const results = allResults.slice(0, 10);
  return { results, allResults, paa };
}

/**
 * Top 100 CrazySerp via `page=10` (cumulatif, 10 crédits).
 * À n'utiliser que quand `findDomainPosition` a renvoyé null sur le top 10/17
 * et qu'on a un site client à matcher : sinon on paie 10 crédits pour rien.
 * Bascule sur la clé fallback en cas d'échec primaire.
 */
export async function fetchCrazyserpTop100(
  keyword: string,
  country: string,
  apiKey: string,
  apiKeyFallback?: string,
): Promise<SerpResult[]> {
  let extended = await fetchCrazyserpPage(keyword, country, apiKey, 10);
  if (!extended && apiKeyFallback) {
    console.log("[crazyserp] top100 primary key failed, trying fallback");
    extended = await fetchCrazyserpPage(keyword, country, apiKeyFallback, 10);
  }
  if (!extended) return [];
  const organic = extended.parsed_data?.organic ?? [];
  return organic.map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title ?? "",
    link: r.url ?? "",
    snippet: r.description ?? "",
    displayed_link: r.url_title ?? r.url ?? "",
  }));
}

// ─── SerpAPI (fallback) ──────────────────────────────────────────────────────

type SerpApiRaw = {
  organic_results?: Array<{
    position?: number;
    title?: string;
    link?: string;
    snippet?: string;
    displayed_link?: string;
  }>;
  related_questions?: Array<{ question?: string; snippet?: string; link?: string }>;
  error?: string;
};

async function fetchSerpapiPage(
  keyword: string,
  gl: string,
  hl: string,
  apiKey: string,
  start: number,
  num: number,
): Promise<SerpApiRaw | null> {
  const params = new URLSearchParams({
    q: keyword,
    gl,
    hl,
    num: String(num),
    api_key: apiKey,
  });
  if (start > 0) params.set("start", String(start));
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const d = (await r.json()) as SerpApiRaw;
  if (d.error) return null;
  return d;
}

async function fetchSerpFromSerpapi(
  keyword: string,
  country: string,
  apiKey: string,
): Promise<{ results: SerpResult[]; allResults: SerpResult[]; paa: Paa[] }> {
  const gl = country === "uk" ? "gb" : country;
  const hl = ["us", "uk"].includes(country) ? "en" : country;

  const first = await fetchSerpapiPage(keyword, gl, hl, apiKey, 0, 100);
  if (!first) return { results: [], allResults: [], paa: [] };

  let allRaw = first.organic_results ?? [];
  const paa: Paa[] = (first.related_questions ?? []).map((q) => ({
    question: q.question ?? "",
    snippet: q.snippet ?? "",
    link: q.link ?? "",
  }));

  let start = allRaw.length;
  let attempts = 0;
  while (allRaw.length < 10 && attempts < 2) {
    attempts++;
    const next = await fetchSerpapiPage(keyword, gl, hl, apiKey, start, 10);
    if (!next) break;
    const more = next.organic_results ?? [];
    if (more.length === 0) break;
    allRaw = [...allRaw, ...more];
    start += more.length;
  }

  const allResults: SerpResult[] = allRaw.map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? "",
    displayed_link: r.displayed_link ?? r.link ?? "",
  }));
  const results = allResults.slice(0, 10);
  return { results, allResults, paa };
}

/**
 * Questions connexes récupérées via Haloscan /api/keywords/questions.
 * Utilisé en complément des PAA SERPAPI quand SERPAPI n'en renvoie pas assez
 * (Google n'affiche pas toujours le bloc "Autres questions posées").
 */
export async function fetchHaloscanQuestions(
  keyword: string,
  country: string,
  token: string,
  limit = 10,
): Promise<Paa[]> {
  try {
    const gl = country === "uk" ? "GB" : country.toUpperCase();
    const r = await fetch("https://api.haloscan.com/api/keywords/questions", {
      method: "POST",
      headers: { "haloscan-api-key": token, "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, country: gl }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { results?: Array<{ keyword?: string }> };
    return (d.results ?? [])
      .slice(0, limit)
      .map((q) => ({ question: q.keyword ?? "", snippet: "", link: "" }))
      .filter((q) => q.question);
  } catch {
    return [];
  }
}

// ─── Haloscan ────────────────────────────────────────────────────────────────

export type HaloscanOverview = {
  keyword: string;
  serpDate?: string;
  resultCount?: number | null;
  search_volume?: number;
  cpc?: number;
  competition?: number;
  difficulty?: number;
  // Renvoyés directement par Haloscan dans seo_metrics quand dispo.
  kgr?: number;
  allintitleCount?: number;
  visibilityIndex?: number;
};

/**
 * Appel Haloscan. L'API attend :
 *   - POST /api/keywords/overview
 *   - Header d'auth : `haloscan-api-key` (PAS Bearer)
 *   - Body JSON : { keyword, country, requested_data: [...] }
 *
 * Validé en recettant les endpoints le 2026-04-14. L'ancien code portait
 * depuis seo-forge-v4.html utilisait `Authorization: Bearer ...` et renvoyait
 * 403 Forbidden systématiquement.
 */
export async function fetchHaloscan(
  keyword: string,
  country: string,
  token: string,
): Promise<HaloscanOverview | null> {
  try {
    const gl = country === "uk" ? "GB" : country.toUpperCase();
    const r = await fetch("https://api.haloscan.com/api/keywords/overview", {
      method: "POST",
      headers: { "haloscan-api-key": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword,
        country: gl,
        requested_data: ["metrics", "serp"],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.error("[haloscan] overview HTTP", r.status, await r.text().catch(() => ""));
      return null;
    }
    const raw = (await r.json()) as {
      keyword?: string;
      errors?: unknown[];
      // Validé via le endpoint de debug 2026-04-15 : Haloscan utilise
      // `seo_metrics` (pas `metrics`) et renvoie "NA" en string quand la
      // donnée n'est pas dispo (ex : mots-clés adultes ou trop longue traîne).
      seo_metrics?: {
        volume?: number | string;
        cpc?: number | string;
        competition?: number | string;
        difficulty?: number | string;
        kgr?: number | string;
        allintitle_count?: number | string;
        results_count?: number | string;
        keyword_visibility_index?: number | string;
        keyword_count?: number | string;
      };
      serp?: { results?: { serp_date?: string }; result_count?: number };
    };
    const m = raw.seo_metrics ?? {};
    return {
      keyword: raw.keyword ?? keyword,
      serpDate: raw.serp?.results?.serp_date,
      resultCount: raw.serp?.result_count ?? toNum(m.results_count) ?? null,
      search_volume: toNum(m.volume),
      cpc: toNum(m.cpc),
      competition: toNum(m.competition),
      difficulty: toNum(m.difficulty),
      kgr: toNum(m.kgr),
      allintitleCount: toNum(m.allintitle_count),
      visibilityIndex: toNum(m.keyword_visibility_index),
    };
  } catch (err) {
    console.error("[haloscan] overview threw:", err);
    return null;
  }
}

// Haloscan renvoie "NA" (string) quand la donnée n'est pas dispo.
// On normalise en undefined pour que le reste du code traite comme manquant.
function toNum(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || s === "NA" || s.toLowerCase() === "n/a") return undefined;
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

// ─── KGR (Keyword Golden Ratio) ──────────────────────────────────────────────

/**
 * KGR = nombre de pages avec le mot-clé EXACT dans le title divisé par le
 * volume mensuel. Calculé via SerpAPI avec le modificateur `allintitle:`.
 * Règle d'usage : KGR < 0.25 = très bon, < 1.0 = correct, sinon trop concurrentiel.
 * On considère l'indicateur valide uniquement quand volume <= 250 (théorie KGR).
 */
export async function fetchAllintitleCount(
  keyword: string,
  country: string,
  apiKey: string,
): Promise<number | null> {
  try {
    const gl = country === "uk" ? "gb" : country;
    const hl = ["us", "uk"].includes(country) ? "en" : country;
    const q = `allintitle:"${keyword}"`;
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&gl=${gl}&hl=${hl}&num=10&api_key=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const d = (await r.json()) as {
      search_information?: { total_results?: number };
      organic_results?: unknown[];
      error?: string;
    };
    if (d.error) return null;
    if (typeof d.search_information?.total_results === "number") {
      return d.search_information.total_results;
    }
    // Fallback : on compte les organic_results retournés (max 10).
    return Array.isArray(d.organic_results) ? d.organic_results.length : 0;
  } catch {
    return null;
  }
}

// ─── Position du domaine client dans la SERP ─────────────────────────────────

/**
 * Cherche la 1re position d'un domaine dans une liste de résultats SERP.
 * Retourne null si le domaine n'apparaît pas dans la liste fournie (typiquement
 * le top 100, au-delà on considère que la page n'est pas positionnée).
 */
export function findDomainPosition(results: SerpResult[], website: string | null): number | null {
  if (!website) return null;
  const target = normalizeDomain(website);
  if (!target) return null;
  for (const r of results) {
    const d = normalizeDomain(r.link);
    if (d && (d === target || d.endsWith("." + target) || target.endsWith("." + d))) {
      return r.position;
    }
  }
  return null;
}

function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

// ─── Crawl + parse HTML ──────────────────────────────────────────────────────

// User-Agent Googlebot smartphone : la plupart des sites e-commerce et media
// laissent passer Googlebot (raisons SEO) là où ils blockent les bots custom.
// Référence : https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers
const GOOGLEBOT_UA =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.156 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/**
 * Tente de récupérer le HTML d'une page :
 *  1. fetch direct avec UA Googlebot — rapide, gratuit
 *  2. fallback Cloudflare Browser Rendering si le fetch échoue ou que le
 *     site renvoie 403/Cloudflare-block (Akamai et co. font du reverse-DNS
 *     sur l'IP, le UA seul ne suffit pas)
 *
 * Le browser rendering coûte du temps de quota (10 min/jour en free tier),
 * on ne l'active que pour les pages réellement bloquées.
 */
/**
 * Cascade de crawl à 2 niveaux :
 *
 *   1. fetch direct UA Googlebot (gratuit) — passe ~70% des sites
 *   2. Bright Data Web Unlocker (Premium domains activé sur la zone) —
 *      IP résidentielle + full JS rendering automatique pour les SPAs et
 *      sites blindés que le fetch direct n'attrape pas.
 *
 * Tentative passée le 2026-05-02 de virer la cascade (BD systématique sur
 * 10/10) : les SERPs e-commerce avec 10 SPAs lourdes en parallèle font
 * dépasser le wall Cloudflare Workers et le worker meurt sans update du
 * status. Cascade restaurée, garde 70% de fetch direct gratuit + BD pour
 * les 30% qui en ont besoin.
 *
 * Bright Data remplace ScrapingBee depuis le 2026-05-02 (cf. crawlWithBrightData).
 * Tarif : $1.50/CPM standard, +$1/CPM sur domaines premium → ~50× moins
 * cher que ScrapingBee à qualité équivalente.
 *
 * Coût moyen attendu pour 10 sites SERP :
 *   - ~7 sites en fetch direct = $0
 *   - ~3 sites en Bright Data, dont 1 premium = ~$0.0055/brief
 *   - 200 briefs/mois ≈ $1.10
 */
export async function crawlPage(
  url: string,
  env: {
    BRIGHTDATA_TOKEN?: string;
    BRIGHTDATA_ZONE?: string;
    BRIGHTDATA_BROWSER_WSS?: string;
  },
): Promise<PageContent | null> {
  // 1. Fetch direct (gratuit)
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": GOOGLEBOT_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        From: "googlebot(at)googlebot.com",
      },
      redirect: "follow",
    });
    if (r.ok) {
      const html = await r.text();
      const truncated = html.length > 2_000_000 ? html.slice(0, 2_000_000) : html;
      if (!looksLikeChallengePage(truncated)) {
        const parsed = parseHTML(truncated);
        // Seuil 200 mots : sous ce seuil on suppose que le contenu est
        // partiel ou tronqué (page non hydratée, contenu lazy-loaded, WAF
        // qui sert une version dégradée). Dans ce cas on bascule sur BD
        // pour récupérer le vrai contenu hydraté.
        if (parsed.wordCount >= 200) return parsed;
      }
    }
  } catch {
    // Timeout / TLS / DNS : on bascule sur Bright Data
  }

  // 2. Bright Data Web Unlocker (zone web_unlocker1, Premium domains activé)
  const fullHtml = await crawlWithBrightData(url, env);
  if (fullHtml && !looksLikeChallengePage(fullHtml)) {
    const parsed = parseHTML(fullHtml);
    // Seuil 100 mots : on accepte un seuil plus bas qu'au niveau fetch
    // direct car BD est notre dernier recours, pas la peine de jeter une
    // page à 150 mots de contenu utile.
    if (parsed.wordCount >= 100) return parsed;
  }

  // 3. Bright Data Scraping Browser via CDP raw (vrai Chromium headless).
  // Pour les SPAs ultra-blindées (Nike Snkrs, Patta, etc.) qui retournent
  // un squelette HTML vide via Web Unlocker. Plus cher (~$0.05/page),
  // donc utilisé uniquement quand les niveaux 1+2 ont échoué.
  const browserHtml = await crawlWithBrightDataBrowser(url, env);
  if (browserHtml && !looksLikeChallengePage(browserHtml)) {
    const parsed = parseHTML(browserHtml);
    if (parsed.wordCount >= 100) return parsed;
  }

  return null;
}

/**
 * Niveau 3 : Bright Data Scraping Browser via Chrome DevTools Protocol raw.
 *
 * Le Browser API de Bright Data n'expose qu'une URL WebSocket Puppeteer.
 * Comme on tourne dans Cloudflare Workers (pas de Node.js, pas de Puppeteer),
 * on parle CDP directement en JSON via WebSocket. ~150 lignes mais zéro
 * dépendance Node.
 *
 * Tarif : $8/GB standard + $3/GB sur domaines premium (Nike, etc.). Une page
 * rendue avec assets ≈ 1-2 MB → ~$0.01-0.025 par crawl.
 *
 * Flow CDP :
 *  1. WS connect vers wss://brd.superproxy.io:9222 (creds inline dans l'URL)
 *  2. Target.createTarget {url} → on a un targetId
 *  3. Target.attachToTarget {targetId, flatten:true} → on a un sessionId
 *  4. Page.enable + Page.navigate → on déclenche le chargement
 *  5. On attend Page.loadEventFired (ou timeout)
 *  6. Runtime.evaluate "document.documentElement.outerHTML" → on a le HTML
 *  7. Target.closeTarget pour libérer le tab
 */
async function crawlWithBrightDataBrowser(
  url: string,
  env: { BRIGHTDATA_BROWSER_WSS?: string },
): Promise<string | null> {
  const wssUrl = env.BRIGHTDATA_BROWSER_WSS;
  if (!wssUrl) return null;

  // Cloudflare Workers : fetch() ne supporte pas wss:// et strippe les
  // credentials inline de l'URL. On parse user:pass de l'URL Bright Data
  // et on les passe en header Authorization: Basic ... à la place.
  // L'URL devient https://host:port/ propre.
  let httpsUrl: string;
  let basicAuth: string;
  try {
    const u = new URL(wssUrl);
    basicAuth = "Basic " + btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`);
    u.username = "";
    u.password = "";
    httpsUrl = u.toString().replace(/^wss:\/\//, "https://");
  } catch (e) {
    console.log("[bd-browser] bad WSS URL", { err: String(e) });
    return null;
  }

  let wsResp: Response;
  try {
    wsResp = await fetch(httpsUrl, {
      headers: {
        Upgrade: "websocket",
        Authorization: basicAuth,
      },
    });
  } catch (e) {
    console.log("[bd-browser] fetch upgrade failed", { url, err: String(e) });
    return null;
  }
  if (wsResp.status !== 101 || !wsResp.webSocket) {
    console.log("[bd-browser] no websocket on response", { url, status: wsResp.status });
    return null;
  }

  const ws = wsResp.webSocket;
  ws.accept();

  let nextId = 1;
  const pending = new Map<number, (result: unknown) => void>();
  const events = new Map<string, ((params: unknown) => void)[]>();

  ws.addEventListener("message", (e: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof e.data === "string" ? e.data : "") as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
        method?: string;
        params?: unknown;
      };
      if (typeof msg.id === "number") {
        const cb = pending.get(msg.id);
        if (cb) {
          pending.delete(msg.id);
          cb(msg.error ? { __error: msg.error.message } : msg.result);
        }
      } else if (msg.method) {
        const handlers = events.get(msg.method);
        if (handlers) handlers.forEach((h) => h(msg.params));
      }
    } catch {}
  });

  const send = <T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> => {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, (result) => {
        if (result && typeof result === "object" && "__error" in result) {
          reject(new Error((result as { __error: string }).__error));
        } else {
          resolve(result as T);
        }
      });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };

  const waitFor = (method: string, timeoutMs = 15000): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting ${method}`)), timeoutMs);
      const handlers = events.get(method) ?? [];
      handlers.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      events.set(method, handlers);
    });

  try {
    // Garde-fou global : on coupe tout après 35s (15s navigate + 5s post-load
    // hydratation + 15s marge pour Runtime.evaluate sur de gros DOM).
    const overall = setTimeout(() => {
      try { ws.close(1000, "overall timeout"); } catch {}
    }, 35000);

    // 1. Crée un nouvel onglet blank (BD interdit d'ouvrir une URL non-blank
    // directement via Target.createTarget)
    const target = await send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });

    // 2. Attache la session pour pouvoir piloter cet onglet
    const attached = await send<{ sessionId: string }>("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sid = attached.sessionId;

    // 3. Active Page domain pour recevoir loadEventFired
    await send("Page.enable", {}, sid);

    // 4. Navigue vers l'URL cible
    await send("Page.navigate", { url }, sid);

    // 5. Attend le chargement complet (DOM + assets), max 15s
    try {
      await waitFor("Page.loadEventFired", 15000);
    } catch {
      // Si load n'est pas firé en 15s, on continue quand même : la page
      // peut avoir bloqué sur un script lent mais le DOM est déjà là.
    }

    // 5. Délai post-load pour laisser les SPAs hydrater l'app. 5s nécessaires
    // sur Nike Snkrs qui charge cookies banner puis fetch le contenu produit
    // en async après loadEventFired.
    await new Promise((r) => setTimeout(r, 5000));

    // 6. Récupère le HTML rendu via Runtime.evaluate
    const evalRes = await send<{
      result: { value?: string };
    }>(
      "Runtime.evaluate",
      {
        expression: "document.documentElement.outerHTML",
        returnByValue: true,
      },
      sid,
    );
    const html = evalRes.result?.value;

    // 7. Ferme l'onglet (best-effort)
    try { await send("Target.closeTarget", { targetId: target.targetId }); } catch {}

    clearTimeout(overall);
    try { ws.close(1000, "done"); } catch {}

    if (typeof html !== "string" || html.length < 500) return null;
    console.log("[bd-browser] ok", { url, htmlLength: html.length });
    return html;
  } catch (e) {
    console.log("[bd-browser] error", { url, err: String(e) });
    try { ws.close(1011, "error"); } catch {}
    return null;
  }
}


/**
 * Niveau 2 : Bright Data Web Unlocker API. JS rendering + IPs résidentielles
 * automatiques sur les domaines bloquants (Akamai, DataDome, Cloudflare
 * Turnstile, etc.) via l'option Premium domains activée sur la zone.
 *
 * Endpoint : POST https://api.brightdata.com/request
 * Tarif (mai 2026) : $1.50/CPM standard, +$1/CPM sur domaines premium.
 *
 * Bench du 2026-05-02 vs ScrapingBee : 10/10 OK avec Premium activé
 * (sport2000 et autres SPAs sur-comptaient du noise chez ScrapingBee, BD
 * est plus précis en moyenne). Coût estimé ~50× moindre.
 *
 * Retourne null si la zone/token ne sont pas configurés ou si la requête échoue.
 */
async function crawlWithBrightData(
  url: string,
  env: { BRIGHTDATA_TOKEN?: string; BRIGHTDATA_ZONE?: string },
): Promise<string | null> {
  try {
    const token = env.BRIGHTDATA_TOKEN;
    const zone = env.BRIGHTDATA_ZONE;
    if (!token || !zone) return null;

    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ zone, url, format: "raw", country: "fr" }),
      // Premium domains peut aller jusqu'à ~30s sur les SPAs lourdes (full JS
      // rendering côté BD). 50s laisse une marge sans bloquer le deadline
      // d'analyse global de 120s côté briefs-service.
      signal: AbortSignal.timeout(50000),
    });
    if (!r.ok) {
      console.log("[brightdata] http error", { url, status: r.status });
      return null;
    }
    const html = await r.text();
    console.log("[brightdata] ok", { url, htmlLength: html.length });
    return html;
  } catch (e) {
    console.log("[brightdata] exception", { url, err: String(e) });
    return null;
  }
}

/**
 * @deprecated Conservé en commentaire pour rollback rapide si Bright Data
 * pose problème. Pour réactiver : décommenter, remettre l'appel dans
 * crawlPage(), et `wrangler secret put SCRAPINGBEE_KEY`.
 *
 * Bench 2026-05-02 : ScrapingBee passait 9/10 sites sur "basket homme"
 * mais sur-comptait le noise (footer/menu) sur sport2000 (404 → 924 mots
 * de bruit) et faguo (1454 vs 523 réels DOM-rendered). Coût ~50× plus cher
 * que Bright Data Web Unlocker à features équivalentes.
 */
// async function crawlWithScrapingBee(
//   url: string,
//   opts: { renderJs: boolean; premiumProxy: boolean },
// ): Promise<string | null> {
//   try {
//     const { getCloudflareContext } = await import("@opennextjs/cloudflare");
//     const env = getCloudflareContext().env as unknown as Record<
//       string,
//       string | undefined
//     >;
//     const apiKey = env.SCRAPINGBEE_KEY;
//     if (!apiKey) return null;
//     const params = new URLSearchParams({
//       api_key: apiKey,
//       url,
//       render_js: opts.renderJs ? "true" : "false",
//       premium_proxy: opts.premiumProxy ? "true" : "false",
//     });
//     if (opts.premiumProxy) params.set("country_code", "fr");
//     if (opts.renderJs) {
//       params.set("wait_browser", "domcontentloaded");
//       params.set("block_resources", "false");
//     }
//     const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`, {
//       signal: AbortSignal.timeout(30000),
//     });
//     if (!r.ok) return null;
//     return await r.text();
//   } catch {
//     return null;
//   }
// }

/**
 * Heuristique pour détecter une page de challenge Cloudflare/Akamai/etc.
 * On regarde quelques marqueurs courants dans le HTML brut.
 */
function looksLikeChallengePage(html: string): boolean {
  const sample = html.slice(0, 5000).toLowerCase();
  return (
    sample.includes("cf-browser-verification") ||
    sample.includes("checking your browser") ||
    sample.includes("challenge-platform") ||
    sample.includes("just a moment") ||
    sample.includes("ray id") ||
    (sample.includes("cloudflare") && html.length < 5000)
  );
}

/**
 * Fallback via Cloudflare Browser Rendering REST API : lance un Chromium
 * headless côté Cloudflare et récupère le HTML rendu. Plus lent (~3-5s)
 * et limité par le quota (10 min/jour en Workers Free).
 *
 * Endpoint :
 *   POST /client/v4/accounts/{account_id}/browser-rendering/content
 *
 * Auth : header `Authorization: Bearer <CF_BROWSER_TOKEN>` (token API
 * avec permission "Account → Browser Rendering: Edit").
 *
 * Retourne null si les credentials ne sont pas configurés ou si la
 * requête échoue.
 */
async function crawlWithBrowser(url: string): Promise<string | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as unknown as Record<
      string,
      string | undefined
    >;
    const accountId = env.CF_ACCOUNT_ID;
    const token = env.CF_BROWSER_TOKEN;
    if (!accountId || !token) {
      console.log("[browser-render] missing config", {
        hasAccount: !!accountId,
        hasToken: !!token,
      });
      return null;
    }

    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          userAgent: GOOGLEBOT_UA,
          // 5s : on accepte de rater quelques challenges qui auraient
          // pu se résoudre tout seuls. Compromis pour rester sous le
          // wall time Cloudflare Workers (30s par invocation par défaut).
          waitForTimeout: 5000,
          gotoOptions: { waitUntil: "domcontentloaded", timeout: 15000 },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.log("[browser-render] http error", { url, status: r.status, body: text.slice(0, 200) });
      return null;
    }
    const data = (await r.json()) as {
      success?: boolean;
      result?: string;
      errors?: Array<{ message?: string }>;
    };
    if (!data.success || !data.result) {
      console.log("[browser-render] api error", {
        url,
        success: data.success,
        errors: data.errors,
      });
      return null;
    }
    console.log("[browser-render] ok", { url, htmlLength: data.result.length });
    return data.result;
  } catch (e) {
    console.log("[browser-render] exception", { url, err: String(e) });
    return null;
  }
}

/**
 * Tags qui ne contiennent jamais de contenu éditorial : navigation, scripts,
 * formulaires, boutons, dialogs… On ignore complètement leur sous-arbre.
 */
const NOISE_TAGS = new Set([
  "nav",
  "footer",
  "header",
  "aside",
  "script",
  "style",
  "noscript",
  "svg",
  "form",
  "iframe",
  "button",
  "input",
  "select",
  "textarea",
  "menu",
  "dialog",
  "template",
]);

/**
 * Class / id qui signalent une zone non-éditoriale (sidebar, breadcrumb,
 * filtre produit, popup cookie, social share, listing produits…).
 * Word boundaries strictes pour éviter de matcher au milieu d'un mot.
 *
 * Sur les pages e-commerce, on rejette les listings de produits volontairement :
 * leurs noms ("Polo Ralph Lauren", "Skechers Sport Confort", etc.) répétés
 * par dizaines biaiseraient le NLP avec du vocabulaire produit/marque qui
 * ne reflète pas l'intent SEO de la page. On garde uniquement le contenu
 * éditorial (intro, description catégorie, FAQ, footer SEO).
 */
const NOISE_CLASS_RE =
  /^(?:cookie[-_]?banner|cookie[-_]?consent|gdpr|newsletter|skip[-_]?link|skip[-_]?to|main[-_]?menu|mega[-_]?menu|nav[-_]?menu|site[-_]?header|site[-_]?footer|recently[-_]?viewed|breadcrumb|filter|filters|sort[-_]?by|pagination|toolbar|category[-_]?(?:tile|nav)|cart|wishlist|mini[-_]?cart|sidebar|side[-_]?panel|drawer|hero[-_]?banner|promo[-_]?banner|social[-_]?(?:share|links?))(?:[-_]|$)/i;
// Note 2026-05-02 : retiré product-(card|tile|teaser), product-count,
// modal et popup du noise.
//
// product-* : les KW e-com type "tshirt blanc" sur Shopify type
// blancofficial.store avaient leur contenu produit bloqué (wc=21 vs
// 184 mots de body). Les noms de produits contiennent souvent les
// tokens du keyword.
//
// modal/popup : Nike Snkrs structure ses pages de drop comme un modal
// overlay (modal-portal-content-wrapper > modal-content > etc.). Avec
// le filter en place, TOUT le contenu Nike (titres, description du
// drop, dates) était bloqué — la page passait à wc=20. En les retirant,
// on récupère ~400 mots utiles. Trade-off : sur les autres sites, les
// vrais cookie-banners/popups d'inscription apportent peu de noise
// (cookie consent = ~30-50 mots) qui sera filtré par les autres règles
// (cookie-banner / newsletter restent dans la regex).

// Balises inline qu'on préserve dans le HTML reconstitué (gras, italique,
// soulignement, etc.). Le texte reste compté normalement pour le NLP. b → strong
// et i → em pour normaliser à la sortie HTML5.
const INLINE_TAG_MAP: Record<string, string> = {
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  u: "u",
  code: "code",
  mark: "mark",
  sup: "sup",
  sub: "sub",
  small: "small",
  s: "s",
  del: "del",
  ins: "ins",
};

export function parseHTML(html: string): PageContent {
  // On parse tout le <body> et on filtre uniquement via NOISE_TAGS et
  // NOISE_CLASS_RE. Auparavant on tentait de restreindre à <main>/<article>
  // mais beaucoup de sites e-commerce (Zalando, Faguo, Decathlon) ont leur
  // contenu SEO éditorial APRÈS le </main> (id="z-content-teaser") OU à
  // l'intérieur d'un main mais bloqué par des wrappers non-fermés
  // proprement par htmlparser2 → wordCount=0 systématique. Filtrer
  // uniquement par NOISE_TAGS (header/nav/footer/aside/script...) +
  // NOISE_CLASS_RE est plus robuste. (Bug fix 2026-05-01.)

  const headings: Heading[] = [];
  const paragraphs: string[] = []; // textes extraits par paragraphe (NLP corpus)
  // Blocs structurés dans l'ordre du document pour reconstituer un HTML
  // propre balisé (utile pour le téléchargement HTML/Word/PDF côté client).
  // Chaque bloc maintient à la fois le texte plat (pour NLP) et le HTML
  // reconstitué (avec balises inline strong/em/u/etc préservées). Les
  // tableaux portent leur structure de cellules complète.
  type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  type ParagraphBlock = {
    tag: HeadingTag | "p" | "blockquote" | "pre";
    text: string;
    html: string;
  };
  type ListItem = { text: string; html: string };
  type ListBlock = { tag: "ul" | "ol"; items: ListItem[] };
  type TableCell = { text: string; html: string; isHeader: boolean };
  type TableRow = { cells: TableCell[] };
  type TableBlock = { tag: "table"; rows: TableRow[] };
  type Block = ParagraphBlock | ListBlock | TableBlock;
  const blocks: Block[] = [];
  let currentHeading: { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; html: string } | null = null;
  let currentParagraph: { text: string; html: string; tag: "p" | "blockquote" | "pre" } | null = null;
  let pCount = 0;
  // État de listes : nesting basique via stack.
  const listStack: ListBlock[] = [];
  let currentLi: { text: string; html: string } | null = null;
  // État de tables : on supporte 1 niveau (pas de tables nested, rare).
  let currentTable: TableBlock | null = null;
  let currentRow: TableRow | null = null;
  let currentCell: TableCell | null = null;

  // Stack des profondeurs où l'on est entré en zone noise : on sort dès
  // qu'on referme la balise correspondante.
  const noiseStack: number[] = [];
  const isInNoise = () => noiseStack.length > 0;

  let depth = 0;
  const collecting = true;
  let imageCount = 0;
  const IMAGE_CAP = 30;

  const isMeaningfulParagraph = (t: string): boolean => {
    if (t.length < 25) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 5) return false;
    return true;
  };

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Routes le texte dans le bon buffer selon l'état d'imbrication courant.
  const appendText = (raw: string) => {
    const escaped = escapeHtml(raw);
    if (currentCell) {
      currentCell.text += raw;
      currentCell.html += escaped;
      return;
    }
    if (currentHeading) {
      currentHeading.text += raw;
      currentHeading.html += escaped;
      return;
    }
    if (currentLi) {
      currentLi.text += raw;
      currentLi.html += escaped;
      return;
    }
    if (currentParagraph) {
      currentParagraph.text += raw;
      currentParagraph.html += escaped;
      return;
    }
    // Texte hors de tout bloc : on le considère comme un paragraphe
    // implicite (cas typique des forums lo-fi sans <p>).
    currentParagraph = { text: raw, html: escapeHtml(raw), tag: "p" };
  };

  // Pareil pour les balises inline qu'on veut garder dans le HTML.
  const appendInlineOpen = (htmlTag: string) => {
    const tag = `<${htmlTag}>`;
    if (currentCell) currentCell.html += tag;
    else if (currentHeading) currentHeading.html += tag;
    else if (currentLi) currentLi.html += tag;
    else if (currentParagraph) currentParagraph.html += tag;
  };
  const appendInlineClose = (htmlTag: string) => {
    const tag = `</${htmlTag}>`;
    if (currentCell) currentCell.html += tag;
    else if (currentHeading) currentHeading.html += tag;
    else if (currentLi) currentLi.html += tag;
    else if (currentParagraph) currentParagraph.html += tag;
  };

  const flushParagraph = () => {
    if (!currentParagraph) return;
    const t = currentParagraph.text.replace(/\s+/g, " ").trim();
    if (t && isMeaningfulParagraph(t)) {
      paragraphs.push(t);
      blocks.push({
        tag: currentParagraph.tag,
        text: t,
        html: currentParagraph.html.replace(/\s+/g, " ").trim(),
      });
    }
    currentParagraph = null;
  };

  const flushLi = () => {
    if (!currentLi) return;
    const t = currentLi.text.replace(/\s+/g, " ").trim();
    if (t && t.length >= 2 && listStack.length > 0) {
      listStack[listStack.length - 1].items.push({
        text: t,
        html: currentLi.html.replace(/\s+/g, " ").trim(),
      });
      paragraphs.push(t);
    }
    currentLi = null;
  };

  const flushCell = () => {
    if (!currentCell) return;
    const t = currentCell.text.replace(/\s+/g, " ").trim();
    if (currentRow) {
      currentRow.cells.push({
        text: t,
        html: currentCell.html.replace(/\s+/g, " ").trim(),
        isHeader: currentCell.isHeader,
      });
      // Le texte des cellules nourrit aussi le NLP.
      if (t) paragraphs.push(t);
    }
    currentCell = null;
  };

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        depth++;
        const lower = name.toLowerCase();

        if (NOISE_TAGS.has(lower)) {
          noiseStack.push(depth);
          return;
        }

        // Liens internes (anchors) : on ignore leur sous-arbre pour ne pas
        // doublonner les TOC. Liens externes : on laisse passer le texte.
        if (lower === "a" && (attrs.href ?? "").startsWith("#")) {
          noiseStack.push(depth);
          return;
        }

        if (lower !== "body" && lower !== "html") {
          const classList = `${attrs.class ?? ""} ${attrs.id ?? ""}`
            .split(/\s+/)
            .filter(Boolean);
          if (classList.some((c) => NOISE_CLASS_RE.test(c))) {
            noiseStack.push(depth);
            return;
          }
        }

        if (!collecting || isInNoise()) return;

        // Inline tags : on les préserve dans le HTML reconstitué sans
        // toucher au texte plat (NLP corpus inchangé).
        const inlineTag = INLINE_TAG_MAP[lower];
        if (inlineTag) {
          appendInlineOpen(inlineTag);
          return;
        }
        // <br> → espace dans le texte, <br> dans le HTML.
        if (lower === "br") {
          appendText(" ");
          if (currentCell) currentCell.html += "<br>";
          else if (currentParagraph) currentParagraph.html += "<br>";
          return;
        }

        // Compteur d'images : on ne compte que les <img> dans le contenu
        // éditorial (les zones noise nav/footer/sidebar/menus sont déjà
        // sortis plus haut via NOISE_TAGS / NOISE_CLASS_RE). Cap dur à 30
        // pour neutraliser les listings e-commerce (grilles produits) qui
        // pourraient remonter 100+ images et tirer la médiane concurrentielle
        // dans le décor.
        if (lower === "img" && imageCount < IMAGE_CAP) {
          imageCount++;
        }

        if (lower.match(/^h[1-6]$/)) {
          flushParagraph();
          flushLi();
          const lvl = parseInt(lower.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
          currentHeading = { level: lvl, text: "", html: "" };
          return;
        }
        if (lower === "p") {
          flushParagraph();
          flushLi();
          pCount++;
          currentParagraph = { text: "", html: "", tag: "p" };
          return;
        }
        if (lower === "blockquote") {
          flushParagraph();
          flushLi();
          currentParagraph = { text: "", html: "", tag: "blockquote" };
          return;
        }
        if (lower === "pre") {
          flushParagraph();
          flushLi();
          currentParagraph = { text: "", html: "", tag: "pre" };
          return;
        }
        if (lower === "ul" || lower === "ol") {
          flushParagraph();
          listStack.push({ tag: lower, items: [] });
          return;
        }
        if (lower === "li") {
          flushLi();
          if (listStack.length > 0) {
            currentLi = { text: "", html: "" };
          }
          return;
        }
        if (lower === "table") {
          flushParagraph();
          flushLi();
          currentTable = { tag: "table", rows: [] };
          return;
        }
        if (lower === "tr" && currentTable) {
          currentRow = { cells: [] };
          return;
        }
        if ((lower === "td" || lower === "th") && currentRow) {
          currentCell = { text: "", html: "", isHeader: lower === "th" };
          return;
        }
      },

      ontext(text) {
        if (!collecting || isInNoise()) return;
        appendText(text);
      },

      onclosetag(name) {
        const lower = name.toLowerCase();

        if (noiseStack.length > 0 && noiseStack[noiseStack.length - 1] === depth) {
          noiseStack.pop();
          depth--;
          return;
        }

        const inlineTag = INLINE_TAG_MAP[lower];
        if (inlineTag) {
          appendInlineClose(inlineTag);
          depth--;
          return;
        }

        if (currentHeading && lower.match(/^h[1-6]$/)) {
          const t = currentHeading.text.replace(/\s+/g, " ").trim();
          if (t) {
            // outline + h1/h2/h3 typés ne supportent que niveaux 1-3
            // (compat avec l'API V2 et le scoring existant). Les h4-h6
            // sont gardés dans `blocks` pour le rendu HTML mais pas
            // exposés dans `headings[]`.
            if (currentHeading.level <= 3) {
              headings.push({
                level: currentHeading.level as 1 | 2 | 3,
                text: t,
              });
            }
            paragraphs.push(t);
            blocks.push({
              tag: lower as HeadingTag,
              text: t,
              html: currentHeading.html.replace(/\s+/g, " ").trim(),
            });
          }
          currentHeading = null;
        }

        if (lower === "p" || lower === "blockquote" || lower === "pre") {
          flushParagraph();
        }

        if (lower === "li") {
          flushLi();
        }

        if (lower === "ul" || lower === "ol") {
          flushLi();
          const list = listStack.pop();
          if (list && list.items.length > 0) {
            blocks.push(list);
          }
        }

        if (lower === "td" || lower === "th") {
          flushCell();
        }

        if (lower === "tr" && currentTable && currentRow) {
          flushCell();
          if (currentRow.cells.length > 0) {
            currentTable.rows.push(currentRow);
          }
          currentRow = null;
        }

        if (lower === "table" && currentTable) {
          if (currentTable.rows.length > 0) {
            blocks.push(currentTable);
          }
          currentTable = null;
        }

        depth--;
      },
    },
    { decodeEntities: true },
  );

  parser.write(html);
  parser.end();
  flushParagraph();

  const h1 = headings.filter((h) => h.level === 1).map((h) => h.text);
  const h2 = headings.filter((h) => h.level === 2).map((h) => h.text);
  const h3 = headings.filter((h) => h.level === 3).map((h) => h.text);

  const text = paragraphs.join(" ").replace(/\s+/g, " ").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const renderTable = (t: TableBlock): string => {
    const rowsHtml = t.rows
      .map((row) => {
        const cellsHtml = row.cells
          .map((c) => `    <${c.isHeader ? "th" : "td"}>${c.html}</${c.isHeader ? "th" : "td"}>`)
          .join("\n");
        return `  <tr>\n${cellsHtml}\n  </tr>`;
      })
      .join("\n");
    return `<table>\n${rowsHtml}\n</table>`;
  };
  const structuredHtml = blocks
    .map((b): string => {
      if (b.tag === "ul" || b.tag === "ol") {
        const items = b.items.map((it) => `  <li>${it.html}</li>`).join("\n");
        return `<${b.tag}>\n${items}\n</${b.tag}>`;
      }
      if (b.tag === "table") {
        return renderTable(b);
      }
      const para = b as ParagraphBlock;
      return `<${para.tag}>${para.html}</${para.tag}>`;
    })
    .join("\n");

  return {
    text,
    h1,
    h2,
    h3,
    outline: headings,
    headings: headings.length,
    paragraphs: pCount || paragraphs.length,
    wordCount,
    imageCount,
    structuredHtml,
  };
}

function extractTag(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const txt = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;|&#\d+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (txt) out.push(txt);
  }
  return out;
}

// ─── NLP / TF-IDF (porté du HTML original) ───────────────────────────────────

const STOPWORDS = new Set(
  [
    "le la les de du des un une et en est que qui dans pour ce il elle ne pas plus son sur au aux avec se par nous vous ils elles on être avoir faire dire aller tout comme mais ou si leur même ces entre sans aussi autre ses très bien fait été cette dont encore peu alors peut",
    // Conjugaisons fréquentes de être et avoir (trop génériques pour figurer
    // dans une suggestion de section ou d'entité).
    "suis es sommes êtes sont étais était étions étiez étaient serai seras sera serons serez seront sois soit soyons soyez soient",
    "ai as avons avez ont avais avait avions aviez avaient aurai auras aura aurons aurez auront aie aies ait ayons ayez aient",
    // Auxiliaires communs
    "peux peut peuvent pouvons pouvez pouvait pouvaient doit doivent devons devez devait devaient fais fait font faisons faites faisait faisaient",
    // Pronoms / déterminants restants
    "ma mon mes ta ton tes votre notre nos vos leurs lui",
    // Anglais conservé (certains concurrents mélangent)
    "the a an and or but in on at to for of with by is are was were be been have has had do does did will would could should may might can shall not no so than that this these those from it its they their them he she his her we our you your i my me us him which who whom what when where how all each every both few more most other some such only own same too very just about above after again before below between down up out off over under further then once here there why any also can more",
  ].join(" ").split(/\s+/).filter(Boolean),
);

const WEB_NOISE = new Set(
  [
    // Navigation / UI générique
    "site web page article contenu lire suite voir plus accueil menu contact cookie cookies politique confidentialité mentions légales droits réservés tous copyright newsletter inscription email commentaire commentaires partager partage facebook twitter linkedin instagram youtube recherche rechercher cliquer cliquez lien liens télécharger download click here read more share follow subscribe login register sign home about blog news skip content main navigation footer sidebar widget category tag archive previous next post related popular recent comments leave reply name email website submit search results found showing page pages back top scroll www http https html css javascript php wordpress site web webpage website online digital internet click button form input select option",
    // Tokens Microsoft Office / CSS / Word XML qui bleed dans le texte extrait
    "mso priority locked semihidden unhidewhenused unhide hidden default style theme background foreground color border margin padding font size weight height width align center left right justify bold italic underline accent shading medium list grid table row column cell pane title subtitle emphasis strong quote caption header footer",
    // Valeurs booléennes et techniques
    "true false null undefined none auto inherit initial transparent solid dashed dotted",
  ].join(" ").split(/\s+/).filter(Boolean),
);

/**
 * Function words (stopwords) qu'on conserve quand on génère les bigrammes /
 * trigrammes : ils portent du sens dans une expression métier ("pas cher",
 * "sans frais", "à petit prix", "sur internet"...). Sans cette whitelist, le
 * filtre stopwords appliqué au tokenizer empêchait toute requête commerciale
 * type "pas cher" de remonter, même si tous les concurrents l'employaient.
 *
 * Règle complémentaire : le DERNIER mot d'un n-gramme doit être non-stopword,
 * pour éviter "chaussure pas" ou "petit prix de" qui sont sémantiquement vides.
 */
const NGRAM_KEEP_STOPWORDS = new Set([
  "pas", "sans", "avec", "pour", "sur", "sous", "contre", "vers",
  "chez", "dans", "par", "entre", "selon",
  "à", "au", "aux", "en", "de", "du", "des",
]);

/**
 * Déterminants articles à exclure quand ils commencent un n-gramme : ils
 * créent des bigrammes sémantiquement vides ("de asics", "des produits",
 * "au homme") observés dans les SERP e-commerce. NE PAS y inclure "à",
 * "en", "pour", "pas", "sans", "avec" qui forment des expressions utiles
 * en début de n-gramme.
 */
const NGRAM_BAD_START = new Set(["de", "du", "des", "au", "aux"]);

/**
 * Mots à exclure de la détection des "sections concurrentes" : ce sont des
 * amorces de H2/H3 (interrogatifs, possessifs, verbes génériques) qui ne
 * représentent pas un sous-thème en soi.
 */
const SECTION_NOISE = new Set(
  [
    // Interrogatifs
    "comment", "pourquoi", "quand", "où", "quoi", "quel", "quelle", "quels",
    "quelles", "savoir", "faire", "ça",
    // Déterminants possessifs
    "votre", "notre", "mon", "ma", "mes", "tes", "ton", "ta", "son", "sa",
    "ses", "leur", "leurs", "vos", "nos",
    // Mots trop vagues
    "tout", "tous", "toute", "toutes", "chaque", "plus",
    // Verbes génériques souvent en H2 ("obtenir sa prime", "bénéficier de...")
    "obtenir", "bénéficier", "demander", "trouver", "avoir", "être", "aller",
    "venir", "choisir", "utiliser", "connaître", "découvrir",
  ],
);

/**
 * Stemmer français simplifié (inspiré Snowball). Réduit les mots à leur
 * radical pour regrouper les familles morphologiques (travaux / travail /
 * travaille / travaillé). Suffixes testés dans l'ordre du plus long au plus
 * court.
 *
 * Mutations consonantiques gérées :
 * - Pluriels en "aux" → "al" (chevaux/cheval, journaux/journal, travaux/travail)
 * - Pluriels en "eaux" → "eau" (chapeaux/chapeau, bateaux/bateau)
 *
 * Limites : pas de gestion des genres (beau/belle), pas des verbes
 * irréguliers (être, avoir) — déjà filtrés via STOPWORDS.
 */
function frenchStem(w: string): string {
  let word = w.toLowerCase();
  if (word.length <= 4) return word;

  // Pré-traitement : mutations consonantiques pluriels en "aux"/"eaux"
  // (avant les suffixes pour matcher correctement la forme singulier).
  if (word.length > 5 && word.endsWith("eaux")) {
    word = word.slice(0, -4) + "eau";
  } else if (word.length > 4 && word.endsWith("aux") && !word.endsWith("eaux")) {
    word = word.slice(0, -3) + "al";
  }

  const suffixes = [
    "issements", "issement", "issantes", "issants", "issante", "issant",
    "ations", "ateurs", "atrices", "ation", "ateur", "atrice",
    "aient", "eraient", "eront", "iront", "iez", "ions",
    "euses", "euse", "eux",
    "tions", "tion",
    "ements", "ement",
    "iques", "ique",
    "ités", "ité",
    "ables", "able", "ibles", "ible",
    "iennes", "ienne", "iens", "ien",
    "antes", "ante", "ants", "ant",
    "entes", "ente", "ents", "ent",
    "ées", "ée", "és", "é",
    "er", "ir", "re",
    "es", "se", "s", "x", "e",
  ];
  for (const sfx of suffixes) {
    if (word.length > sfx.length + 3 && word.endsWith(sfx)) {
      return word.slice(0, -sfx.length);
    }
  }
  return word;
}

/**
 * Liaison words qu'on ignore quand on calcule un "fingerprint sémantique"
 * d'un terme. Sert à considérer "sneakers homme" et "sneakers pour homme"
 * comme équivalents (même intent SEO, juste une préposition différente).
 */
const FINGERPRINT_FILLERS = new Set([
  "pour", "de", "du", "des", "à", "au", "aux", "en", "avec", "sans",
  "sur", "sous", "vers", "chez", "dans", "par", "entre", "selon",
  "le", "la", "les", "un", "une", "et", "ou",
]);

/**
 * Fingerprint canonique d'un terme = ensemble trié des stems des mots
 * significatifs. Permet la déduplication sémantique :
 *   "sneakers homme"        → "homm sneaker"
 *   "sneakers pour homme"   → "homm sneaker"  (pour ignoré)
 *   "homme sneakers"        → "homm sneaker"  (ordre indifférent)
 *
 * Renvoie chaîne vide si aucun mot significatif (ne déduplique pas dans ce cas).
 */
function semanticFingerprint(term: string): string {
  const tokens = term
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FINGERPRINT_FILLERS.has(w))
    .map((w) => frenchStem(w));
  if (tokens.length === 0) return "";
  return Array.from(new Set(tokens)).sort().join(" ");
}

export function runNLP(contents: PageContent[], keyword: string): NlpResult {
  const n = contents.length;
  const valid = contents.filter((c) => c && c.wordCount > 50);
  const kwLower = keyword.toLowerCase().trim();
  const kwParts = kwLower.split(/\s+/);

  // Exact keyword analysis
  let kwInH1 = 0,
    kwInH2 = 0,
    kwInFirst100 = 0;
  const kwDensities: number[] = [];
  const kwCounts: number[] = [];
  valid.forEach((c) => {
    const tl = c.text.toLowerCase();
    const words = tl.split(/\s+/);
    if (c.h1?.some((h) => h.toLowerCase().includes(kwLower))) kwInH1++;
    if (c.h2?.some((h) => h.toLowerCase().includes(kwLower))) kwInH2++;
    if (words.slice(0, 100).join(" ").includes(kwLower)) kwInFirst100++;
    const rx = new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const m = tl.match(rx);
    const cnt = m ? m.length : 0;
    kwCounts.push(cnt);
    kwDensities.push(words.length > 0 ? ((cnt * kwParts.length) / words.length) * 100 : 0);
  });
  const avgKwCnt = kwCounts.length
    ? Math.round(kwCounts.reduce((a, b) => a + b, 0) / kwCounts.length)
    : 3;
  const avgKwDen = kwDensities.length
    ? Math.round((kwDensities.reduce((a, b) => a + b, 0) / kwDensities.length) * 100) / 100
    : 1;
  const kwVariations = new Set<string>([kwLower]);
  kwParts.forEach((p) => {
    if (p.length > 3) kwVariations.add(p);
    if (p.endsWith("s") && p.length > 4) kwVariations.add(p.slice(0, -1));
    if (!p.endsWith("s") && p.length > 3) kwVariations.add(p + "s");
  });
  const kwStems = new Set([...kwVariations].map(frenchStem));

  // ── Pipeline sémantique : BM25 + trigrammes + stemming ──────────────────
  // On raisonne en "termes" (= stems pour les unigrammes, surface-form pour
  // les bigrammes/trigrammes) plutôt que strictement en tokens du texte.
  // Pour chaque unigramme stemmé, on garde la liste des surface-forms afin
  // de pouvoir afficher la forme la plus fréquente ET matcher toutes les
  // variantes dans l'éditeur.
  const docFreq: Record<string, number> = {};
  const allTerms: Array<{ tf: Record<string, number>; total: number }> = [];
  const headingStems = new Set<string>();
  // Map stem → surface-form → count total (tous docs confondus)
  const surfaceForms: Record<string, Record<string, number>> = {};

  contents.forEach((c) => {
    if (!c || !c.text) return;
    // Tokens des titres : stemmés, pour le boost en scoring.
    // Apostrophes remplacées par espace AVANT le strip non-alphanum, sinon
    // "d'un" devient "dun" (idem rawWords/ngramWords ci-dessous).
    [...(c.h1 ?? []), ...(c.h2 ?? [])].forEach((h) => {
      h.toLowerCase()
        .replace(/[''`]/g, " ")
        .replace(/[^a-zà-ÿ0-9\s-]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .forEach((w) => headingStems.add(frenchStem(w)));
    });
    // rawWords : filtre strict (sans stopwords) pour les unigrammes BM25.
    const rawWords = c.text
      .toLowerCase()
      .replace(/[''`]/g, " ")
      .replace(/[^a-zà-ÿ0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !WEB_NOISE.has(w));
    // ngramWords : filtre permissif qui conserve les function words à valeur
    // sémantique (NGRAM_KEEP_STOPWORDS) pour pouvoir reconstituer "pas cher",
    // "à petit prix" etc. Min 2 lettres, pas de digits seuls.
    const ngramWords = c.text
      .toLowerCase()
      .replace(/[''`]/g, " ")
      .replace(/[^a-zà-ÿ0-9\s-]/g, "")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 1 &&
          !/^\d+$/.test(w) &&
          (!STOPWORDS.has(w) || NGRAM_KEEP_STOPWORDS.has(w)) &&
          !WEB_NOISE.has(w),
      );
    // Séquence stemmée pour les unigrammes (BM25 sur stems).
    const stems = rawWords.map(frenchStem);

    const tf: Record<string, number> = {};
    const seen = new Set<string>();

    // Unigrammes : clé = stem
    stems.forEach((s, i) => {
      tf[s] = (tf[s] ?? 0) + 1;
      if (!seen.has(s)) {
        docFreq[s] = (docFreq[s] ?? 0) + 1;
        seen.add(s);
      }
      // Trace surface-form
      const surface = rawWords[i];
      surfaceForms[s] ??= {};
      surfaceForms[s][surface] = (surfaceForms[s][surface] ?? 0) + 1;
    });

    // Bigrammes (non stemmés, pour lisibilité). Construits depuis ngramWords
    // pour permettre les expressions avec function words ("pas cher", "à
    // emporter"). Le dernier mot doit être non-stopword pour éviter
    // "chaussure pas", "petit prix de", etc.
    for (let i = 0; i < ngramWords.length - 1; i++) {
      const w2 = ngramWords[i + 1];
      if (STOPWORDS.has(w2)) continue;
      const bg = ngramWords[i] + " " + w2;
      tf[bg] = (tf[bg] ?? 0) + 1;
      if (!seen.has(bg)) {
        docFreq[bg] = (docFreq[bg] ?? 0) + 1;
        seen.add(bg);
      }
    }

    // Trigrammes (non stemmés) : capture des expressions métier type
    // "crédit impôt transition", "agence nationale habitat", "chaussure pas cher".
    for (let i = 0; i < ngramWords.length - 2; i++) {
      const w3 = ngramWords[i + 2];
      if (STOPWORDS.has(w3)) continue;
      const tg = ngramWords[i] + " " + ngramWords[i + 1] + " " + w3;
      tf[tg] = (tf[tg] ?? 0) + 1;
      if (!seen.has(tg)) {
        docFreq[tg] = (docFreq[tg] ?? 0) + 1;
        seen.add(tg);
      }
    }

    allTerms.push({ tf, total: rawWords.length });
  });

  // Longueur moyenne des documents (pour BM25)
  const avgDocLen =
    allTerms.length > 0
      ? allTerms.reduce((s, d) => s + d.total, 0) / allTerms.length
      : 1;
  // Paramètres BM25 standards (Okapi)
  const K1 = 1.5;
  const B = 0.75;

  // Score BM25 pour chaque terme, agrégé sur l'ensemble des documents où il
  // apparaît. idf(t) = log((N - df + 0.5)/(df + 0.5) + 1).
  const termScore: Record<string, number> = {};
  for (const [t, df] of Object.entries(docFreq)) {
    const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
    let total = 0;
    for (const d of allTerms) {
      const f = d.tf[t];
      if (!f) continue;
      const norm = 1 - B + B * (d.total / avgDocLen);
      total += idf * (f * (K1 + 1)) / (f + K1 * norm);
    }
    termScore[t] = total;
  }

  const nlpTerms: NlpTerm[] = Object.entries(termScore)
    .map(([key, score]) => {
      const df = docFreq[key] ?? 0;
      const presence = df / n;
      const isNgram = key.includes(" ");
      // Boost heading : le terme (stem unigramme ou un des mots du n-gram) doit
      // apparaître dans un H1/H2 chez un concurrent.
      const headingBoost = isNgram
        ? key.split(" ").some((w) => headingStems.has(frenchStem(w)))
          ? 1.4
          : 1
        : headingStems.has(key)
          ? 1.4
          : 1;
      const relevance = score * (0.3 + 0.7 * presence) * headingBoost;

      // Display form : pour les unigrammes on prend la surface-form la plus
      // fréquente du stem ; pour les n-grammes le n-gram est déjà en surface.
      let displayTerm = key;
      let variants: string[] | undefined;
      if (!isNgram) {
        const variantMap = surfaceForms[key] ?? {};
        const sorted = Object.entries(variantMap).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) displayTerm = sorted[0][0];
        variants = sorted.map(([v]) => v);
      }

      // Distribution d'occurrences chez les concurrents qui emploient le terme.
      // Quartiles P25-P75 pour une fourchette serrée autour de la médiane.
      const counts: number[] = [];
      for (const d of allTerms) {
        const c = d.tf[key];
        if (c && c > 0) counts.push(c);
      }
      counts.sort((a, b) => a - b);
      const sampleSize = counts.length;
      const avgRaw = sampleSize ? counts.reduce((s, c) => s + c, 0) / sampleSize : 0;
      const avgCount = sampleSize ? Math.max(1, Math.round(avgRaw)) : 0;
      let minCount = 0;
      let maxCount = 0;
      if (sampleSize >= 4) {
        const p25 = counts[Math.floor(0.25 * (sampleSize - 1))];
        const p75 = counts[Math.ceil(0.75 * (sampleSize - 1))];
        minCount = Math.max(1, p25);
        maxCount = Math.max(minCount, p75);
      } else if (sampleSize > 0) {
        minCount = Math.max(1, counts[0]);
        maxCount = Math.max(minCount, counts[sampleSize - 1]);
      }
      if (avgCount > 0) {
        if (avgCount < minCount) minCount = avgCount;
        if (avgCount > maxCount) maxCount = avgCount;
      }

      return {
        term: displayTerm,
        variants,
        score: relevance,
        presence: Math.round(presence * 100),
        df,
        inHeadings: headingBoost > 1,
        minCount,
        maxCount,
        avgCount,
        // Clé interne pour le filtre (stem pour les unigrammes, n-gram sinon)
        _key: key,
      };
    })
    .filter((k) => {
      // On travaille sur le mot de surface pour les filtres lexicaux, mais on
      // exclut aussi le stem du mot-clé principal pour ne pas polluer la
      // suggestion avec des variantes triviales.
      const surface = k.term;
      const stem = k._key.includes(" ") ? null : k._key;
      if (kwVariations.has(surface)) return false;
      if (stem && kwStems.has(stem)) return false;
      if (k.df < 2) return false;
      if (k.presence < 25) return false;
      if (!surface.includes(" ") && surface.length <= 3) return false;
      if (WEB_NOISE.has(surface) || (stem && WEB_NOISE.has(stem))) return false;
      if (k.avgCount > 0 && k.maxCount >= k.avgCount * 10) return false;
      if (!surface.includes(" ") && surface.length > 14) return false;
      if (!surface.includes(" ")) {
        const vowels = (surface.match(/[aeiouyàâéèêëîïôöùûü]/gi) ?? []).length;
        if (vowels === 0) return false;
        if (vowels / surface.length < 0.2) return false;
      }
      if (surface.includes(" ")) {
        const parts = surface.split(/\s+/);
        if (parts.every((p) => WEB_NOISE.has(p))) return false;
        // Évite les n-grams qui répètent un mot ("café emporter café"),
        // artefact courant quand le keyword inclut une préposition très
        // fréquente. Forme `parts.length !== Set(parts).size` pour catcher
        // aussi "X Y X" (le simple `Set.size === 1` ratait ce cas).
        if (parts.length !== new Set(parts).size) return false;
        // Rejette les n-grammes qui commencent par un déterminant article
        // (de, du, des, au, aux) : sémantiquement vides en isolation. On
        // garde les prépositions à valeur (à, en, pas, sans, avec) qui
        // forment des expressions utiles.
        if (NGRAM_BAD_START.has(parts[0])) return false;
        // Skip si le bigramme commence par un chiffre seul ("15 prix" pour
        // "iphone 15 prix" → inutile en isolation).
        if (/^\d+$/.test(parts[0])) return false;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
    .map(({ _key, ...rest }) => rest as NlpTerm);

  const avg = (arr: PageContent[], fn: (c: PageContent) => number) =>
    arr.length ? Math.round(arr.reduce((s, c) => s + fn(c), 0) / arr.length) : 0;

  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  };

  const avgWC = avg(valid, (c) => c.wordCount) || 1500;
  const medImg = median(valid.map((c) => c.imageCount));
  const sections = detectCompetitorSections(valid, kwStems);
  const entities = detectNamedEntities(valid);
  const baseKeywordTerms = computeKeywordTerms(valid, kwLower, kwParts);
  const keywordTerms = mergeKeywordExtensions(baseKeywordTerms, nlpTerms, kwParts);

  // Déduplication sémantique : on calcule un fingerprint canonique pour
  // chaque terme (ensemble des stems significatifs, ignorant les
  // function words "pour", "de", "à"...) et on rejette les nlpTerms qui :
  //   1. ont le même fingerprint qu'un keywordTerm (déjà affiché en tête)
  //   2. ont le même fingerprint qu'un autre nlpTerm de meilleur score
  // Évite "sneakers homme" + "sneakers pour homme" + "sneakers" comme 3
  // entrées distinctes alors que c'est sémantiquement la même chose.
  const kwFingerprints = new Set(keywordTerms.map((k) => semanticFingerprint(k.term)));
  const nlpFingerprintsSeen = new Set<string>();
  const dedupedNlpTerms = nlpTerms.filter((t) => {
    const fp = semanticFingerprint(t.term);
    if (!fp) return true;
    if (kwFingerprints.has(fp)) return false;
    if (nlpFingerprintsSeen.has(fp)) return false;
    nlpFingerprintsSeen.add(fp);
    return true;
  });

  return {
    exactKeyword: {
      keyword: kwLower,
      variations: [...kwVariations],
      avgCount: avgKwCnt,
      avgDensity: avgKwDen,
      idealDensityMin: Math.max(0.3, avgKwDen * 0.6),
      idealDensityMax: Math.min(3, avgKwDen * 1.5),
      inH1Pct: valid.length ? Math.round((kwInH1 / valid.length) * 100) : 0,
      inH2Pct: valid.length ? Math.round((kwInH2 / valid.length) * 100) : 0,
      inFirst100Pct: valid.length ? Math.round((kwInFirst100 / valid.length) * 100) : 0,
    },
    keywordTerms,
    nlpTerms: dedupedNlpTerms,
    sections,
    entities,
    avgWordCount: avgWC,
    avgHeadings: avg(valid, (c) => c.headings) || 8,
    avgParagraphs: avg(valid, (c) => c.paragraphs) || 15,
    minWordCount: Math.round(avgWC * 0.7),
    maxWordCount: Math.round(avgWC * 1.3),
    medianImages: medImg,
  };
}

// ─── Sous-parties du mot-clé principal à placer ──────────────────────────────

/**
 * Pour le mot-clé saisi par l'utilisateur, calcule la fourchette d'occurrences
 * chez les concurrents pour :
 *   1. Le keyword exact ("chaussure pas cher")
 *   2. Chacun des mots constitutifs sémantiques ("chaussure", "cher" ;
 *      les stopwords purs comme "pas" sont sautés en isolation car sans valeur)
 *   3. Les bigrammes consécutifs valides du keyword ("pas cher")
 *
 * Le filtre nlpTerms exclut volontairement ces termes (ils sont marqués comme
 * variantes du keyword), donc l'utilisateur ne les verrait pas autrement. On
 * les fournit dans un champ séparé pour les afficher en tête de l'éditeur avec
 * un statut "à placer absolument".
 */
function computeKeywordTerms(
  pages: PageContent[],
  keyword: string,
  kwParts: string[],
): KeywordTerm[] {
  if (pages.length === 0 || !keyword) return [];

  const candidates: Array<{ term: string; kind: "exact" | "part" }> = [];
  const seen = new Set<string>();
  const push = (term: string, kind: "exact" | "part") => {
    if (!term || seen.has(term)) return;
    seen.add(term);
    candidates.push({ term, kind });
  };

  // Mots qui n'ont pas de valeur en isolation pour l'auteur (interrogatifs,
  // possessifs, déterminants vagues). On les garde dans les bigrammes
  // ("comment choisir", "son assurance") mais on ne les promeut pas seuls.
  const NON_SEMANTIC_PARTS = new Set([
    "comment", "pourquoi", "quand", "où", "quoi",
    "quel", "quelle", "quels", "quelles",
    "votre", "notre", "mon", "ma", "mes", "tes", "ton", "ta", "sa",
    "leurs", "vos", "nos",
    "tout", "tous", "toute", "toutes", "chaque",
  ]);

  push(keyword, "exact");
  for (const w of kwParts) {
    if (w.length < 3) continue;
    if (STOPWORDS.has(w)) continue;
    if (NON_SEMANTIC_PARTS.has(w)) continue;
    push(w, "part");
  }
  if (kwParts.length >= 3) {
    for (let i = 0; i < kwParts.length - 1; i++) {
      const w1 = kwParts[i];
      const w2 = kwParts[i + 1];
      if (STOPWORDS.has(w2)) continue;
      // Skip si le bigramme commence par un chiffre seul ("15 prix" pour le
      // keyword "iphone 15 prix" → inutile en isolation).
      if (/^\d+$/.test(w1)) continue;
      push(`${w1} ${w2}`, "part");
    }
  }

  return candidates.map(({ term, kind }) => {
    // Pour chaque mot du term, on autorise un 's' final optionnel afin de
    // matcher singulier/pluriel ("chaussure pas cher" matche "chaussures pas
    // chers" et toutes les combinaisons). Sans ça, un keyword au singulier
    // raterait toutes les pages qui l'écrivent au pluriel (très fréquent en
    // e-commerce). Mots de 3 lettres ou moins : pas de variation.
    const wordPatterns = term.split(/\s+/).map((w) => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (w.length <= 3) return esc;
      if (w.endsWith("s")) return `${esc.slice(0, -1)}s?`;
      return `${esc}s?`;
    });
    // Word boundaries pour ne pas matcher "cher" dans "chercher" ou "marché".
    const pattern = `(?:^|[^a-zà-ÿ0-9])${wordPatterns.join(" ")}(?=$|[^a-zà-ÿ0-9])`;
    const rx = new RegExp(pattern, "gi");
    const rxHead = new RegExp(pattern, "i");

    const counts: number[] = [];
    let usedBy = 0;
    let inH = false;
    pages.forEach((p) => {
      const m = p.text.toLowerCase().match(rx);
      const cnt = m ? m.length : 0;
      if (cnt > 0) {
        counts.push(cnt);
        usedBy++;
      }
      if ([...(p.h1 ?? []), ...(p.h2 ?? [])].some((h) => rxHead.test(h.toLowerCase()))) {
        inH = true;
      }
    });

    counts.sort((a, b) => a - b);
    const sample = counts.length;
    const avgRaw = sample ? counts.reduce((s, c) => s + c, 0) / sample : 0;
    const avgCount = sample ? Math.max(1, Math.round(avgRaw)) : 0;
    let minCount = 0;
    let maxCount = 0;
    if (sample >= 4) {
      const p25 = counts[Math.floor(0.25 * (sample - 1))];
      const p75 = counts[Math.ceil(0.75 * (sample - 1))];
      minCount = Math.max(1, p25);
      maxCount = Math.max(minCount, p75);
    } else if (sample > 0) {
      minCount = Math.max(1, counts[0]);
      maxCount = Math.max(minCount, counts[sample - 1]);
    }
    if (avgCount > 0) {
      if (avgCount < minCount) minCount = avgCount;
      if (avgCount > maxCount) maxCount = avgCount;
    }

    return {
      term,
      kind,
      presence: Math.round((usedBy / pages.length) * 100),
      inHeadings: inH,
      minCount,
      maxCount,
      avgCount,
    };
  });
}

/**
 * Détecte les "extensions de keyword" : les nlpTerms top (présence ≥ 40%) qui
 * contiennent un mot significatif du keyword principal. Utile sur les keywords
 * courts type "kayano 14", "iphone 15", "tesla model y" où le marché utilise
 * presque toujours une forme étendue (marque + modèle, ex: "asics gel-kayano").
 *
 * Retourne la liste keywordTerms enrichie : termes existants + extensions
 * détectées (kind "extension"), sans doublonner avec ce qui est déjà présent.
 */
function mergeKeywordExtensions(
  base: KeywordTerm[],
  nlp: NlpTerm[],
  kwParts: string[],
): KeywordTerm[] {
  const significantKwTokens = new Set(
    kwParts.filter((p) => p.length >= 3 && !STOPWORDS.has(p)),
  );
  if (significantKwTokens.size === 0) return base;
  const kwStems = new Set(
    Array.from(significantKwTokens).map((w) => frenchStem(w)),
  );
  const matchesKwToken = (tok: string): boolean => {
    if (significantKwTokens.has(tok)) return true;
    const tokStem = frenchStem(tok);
    if (kwStems.has(tokStem)) return true;
    // Match substring tolérant : "gel-kayano" contient "kayano", "chaussures"
    // contient "chaussure" via stem. Min 4 lettres pour éviter les faux
    // positifs ("art" dans "marketing").
    for (const kw of significantKwTokens) {
      if (kw.length >= 4 && tok.includes(kw)) return true;
      if (tok.length >= 4 && kw.includes(tok)) return true;
    }
    return false;
  };
  const existing = new Set(base.map((b) => b.term));
  // Dédup sémantique : "basket homme" (part) et "baskets homme" (extension)
  // ont le même fingerprint (basket/baskets stems pareil), on en garde un
  // seul. Évite les doublons triviaux singulier/pluriel dans l'UI.
  const existingFingerprints = new Set(base.map((b) => semanticFingerprint(b.term)).filter(Boolean));
  const extensions: KeywordTerm[] = [];
  for (const t of nlp.slice(0, 30)) {
    // Seuil 40% : permissif pour rattraper les vraies extensions ("améliorer
    // seo" 44%, "chaussures femme" 43%, "tiramisu au citron"). Le filtrage
    // par contenu de mot du keyword reste strict (matchesKwToken), donc le
    // seuil bas ne crée pas de faux positifs.
    if (t.presence < 40) continue;
    if (existing.has(t.term)) continue;
    const fp = semanticFingerprint(t.term);
    if (fp && existingFingerprints.has(fp)) continue;
    const tokens = t.term.split(/\s+/);
    if (!tokens.some(matchesKwToken)) continue;
    extensions.push({
      term: t.term,
      kind: "extension",
      presence: t.presence,
      inHeadings: t.inHeadings,
      minCount: t.minCount,
      maxCount: t.maxCount,
      avgCount: t.avgCount,
    });
    existing.add(t.term);
    if (fp) existingFingerprints.add(fp);
  }
  // Trie : exact en premier, parts ensuite, extensions en dernier. Ordre
  // stable pour un affichage cohérent.
  const order = { exact: 0, part: 1, extension: 2 };
  return [...base, ...extensions].sort((a, b) => order[a.kind] - order[b.kind]);
}

// ─── Détection des sections obligatoires (H2/H3 du top 10) ───────────────────

/**
 * Pour chaque stem significatif apparaissant dans un H2/H3, compte combien de
 * concurrents distincts le couvrent. On garde les stems présents chez au moins
 * 30 % des concurrents (min. 3) et on renvoie la forme surface la plus
 * fréquente + un échantillon de headings pour illustrer la section.
 */
function detectCompetitorSections(
  pages: PageContent[],
  excludeStems: Set<string>,
): Section[] {
  const total = pages.length;
  if (total === 0) return [];

  // stem → {competitors (set d'index), surfaceCounts, sampleHeadings (max 3)}
  const map: Record<
    string,
    {
      sources: Set<number>;
      surfaces: Record<string, number>;
      samples: string[];
    }
  > = {};

  pages.forEach((p, idx) => {
    const headings = [...(p.h2 ?? []), ...(p.h3 ?? [])];
    const stemsInThisPage = new Set<string>();
    headings.forEach((h) => {
      const tokens = h
        .toLowerCase()
        .replace(/[^a-zà-ÿ0-9\s'-]/g, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 3 &&
            !STOPWORDS.has(w) &&
            !WEB_NOISE.has(w) &&
            !SECTION_NOISE.has(w) &&
            !/^\d+$/.test(w),
        );
      tokens.forEach((tok) => {
        const stem = frenchStem(tok);
        if (excludeStems.has(stem)) return;
        if (SECTION_NOISE.has(stem)) return;
        // Matching par préfixe : si le stem de la section partage un préfixe
        // de 4+ caractères avec un stem du mot-clé, on considère que c'est
        // une variante du keyword et on l'exclut. Gère "énergie" vs
        // "énergétique" (stems "énergi" vs "énergét" → préfixe "énerg").
        let isKeywordVariant = false;
        for (const kwStem of excludeStems) {
          if (kwStem.length < 4) continue;
          const minPrefix = Math.min(kwStem.length, stem.length, 5);
          if (minPrefix < 4) continue;
          if (stem.slice(0, minPrefix) === kwStem.slice(0, minPrefix)) {
            isKeywordVariant = true;
            break;
          }
        }
        if (isKeywordVariant) return;
        stemsInThisPage.add(stem);
        map[stem] ??= { sources: new Set(), surfaces: {}, samples: [] };
        map[stem].surfaces[tok] = (map[stem].surfaces[tok] ?? 0) + 1;
        if (map[stem].samples.length < 3 && !map[stem].samples.includes(h)) {
          map[stem].samples.push(h);
        }
      });
    });
    // Un concurrent = 1 hit max par stem
    for (const stem of stemsInThisPage) {
      map[stem].sources.add(idx);
    }
  });

  return Object.entries(map)
    .map(([stem, data]) => {
      const hits = data.sources.size;
      const label = Object.entries(data.surfaces).sort((a, b) => b[1] - a[1])[0]?.[0] ?? stem;
      const keyTerms = Object.keys(data.surfaces);
      return {
        label,
        hits,
        total,
        sampleHeadings: data.samples,
        keyTerms,
      };
    })
    .filter((s) => s.hits >= Math.max(3, Math.ceil(total * 0.3)))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 12);
}

// ─── Détection des entités nommées (heuristique sans IA) ─────────────────────

/**
 * Extrait les tokens capitalisés au milieu d'une phrase (majuscule initiale
 * hors début de phrase) + les acronymes (2-5 lettres maj). Puis agrège par
 * concurrent distinct et garde les entités citées par >= 30 % du top 10.
 *
 * Limite volontaire : unigramme uniquement. Les entités multi-mots type
 * "Agence Nationale de l'Habitat" apparaissent via leur head noun ou leur
 * acronyme ("ANAH") qui sont tous deux détectés.
 */
function detectNamedEntities(pages: PageContent[]): Entity[] {
  const total = pages.length;
  if (total === 0) return [];

  // Liste de tokens à ignorer même s'ils sont capitalisés : mois, jours,
  // noms génériques de pays / marques partout, etc.
  const ENTITY_STOP = new Set(
    [
      "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
      "septembre", "octobre", "novembre", "décembre",
      "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
      "france", "europe", "paris", "google", "facebook", "twitter", "linkedin",
      "instagram", "youtube", "tiktok", "whatsapp",
      "non", "oui", "mais", "avec", "sans", "tout", "tous", "toute", "toutes",
      "lui", "elle", "elles", "nous", "vous",
      "lorsque", "lorsqu", "quand", "pendant", "depuis", "jusqu", "selon",
      // Pronoms / déterminants souvent isolés en majuscule dans titres/phrases
      "je", "tu", "ma", "mon", "ta", "ton", "sa", "son", "mes", "tes", "ses",
      "notre", "votre", "leur", "nos", "vos", "leurs",
      // Mots interrogatifs capitalisés en début de titre
      "comment", "pourquoi", "quoi", "quel", "quelle", "quels", "quelles",
      "avant", "après", "pendant",
    ].map((s) => s.toLowerCase()),
  );

  const map: Record<
    string,
    { sources: Set<number>; display: string; occurrences: number }
  > = {};

  pages.forEach((p, idx) => {
    // Statistiques de casse par page pour filtrer les mots communs
    // capitalisés dans des titres (ex: "PRIME" en H1, "Chauffage" en H2).
    // Un vrai acronyme comme "CEE" n'apparaît jamais en minuscules.
    // Un vrai nom propre ("MaPrimeRénov'") apparaît peu en minuscules.
    const caseStats: Record<
      string,
      { lower: number; allCaps: number; titleCase: number }
    > = {};
    const rawTokens = p.text.split(/[^\wÀ-ÿ'']+/).filter((t) => t.length > 1);
    for (const tok of rawTokens) {
      const lc = tok.toLowerCase();
      caseStats[lc] ??= { lower: 0, allCaps: 0, titleCase: 0 };
      if (tok === lc) caseStats[lc].lower++;
      else if (tok === tok.toUpperCase() && /^[A-ZÀ-Ÿ]{2,}$/.test(tok))
        caseStats[lc].allCaps++;
      else caseStats[lc].titleCase++;
    }

    // On découpe en phrases pour ignorer le 1er mot (initiale automatique).
    const sentences = p.text.split(/(?<=[.!?])\s+/);
    const localEntities = new Set<string>();
    sentences.forEach((sent) => {
      const tokens = sent.split(/\s+/);
      tokens.forEach((raw, i) => {
        const clean = raw.replace(/[.,;:!?"'()\[\]«»…]/g, "").trim();
        if (clean.length < 2) return;
        const isAcronym = /^[A-Z]{2,6}$/.test(clean);
        const isCapStart =
          /^[A-ZÀÂÉÈÊËÎÏÔÖÙÛÜÇ][a-zà-ÿ'’-]+$/.test(clean) && i > 0;
        if (!isAcronym && !isCapStart) return;
        const key = clean.toLowerCase();
        if (ENTITY_STOP.has(key)) return;
        if (STOPWORDS.has(key)) return;

        // FILTRE CLÉ : si le mot apparaît aussi en minuscule dans le même
        // document, c'est un mot commun capitalisé dans un titre, pas une
        // entité. "PRIME"/"prime" → rejeté, "CEE"/"cee" (jamais en minuscule)
        // → accepté.
        const stats = caseStats[key];
        if (stats) {
          if (isAcronym) {
            // Acronyme : on rejette dès qu'on voit 1 occurrence en minuscule
            // (signe que le mot existe comme mot commun dans la même page).
            if (stats.lower >= 1) return;
          } else if (isCapStart) {
            // Title case : un vrai nom propre apparaît quasi exclusivement en
            // majuscule. On rejette dès qu'il y a au moins 1 occurrence en
            // minuscule ET que la title-case form n'est pas écrasante
            // (>= 80 % des apparitions). Gère "Chauffage" (capitalisé en H2
            // + écrit "chauffage" 30× en body → rejeté) sans exclure
            // "MaPrimeRénov'" (jamais en lowercase).
            const totalObs = stats.lower + stats.titleCase + stats.allCaps;
            if (stats.lower >= 1 && stats.titleCase < totalObs * 0.8) return;
            // Filtre supplémentaire : exiger au moins 2 occurrences title-case
            // distinctes dans la page (sinon artefact d'un seul titre).
            if (stats.titleCase + stats.allCaps < 2) return;
          }
        }

        localEntities.add(key);
        map[key] ??= { sources: new Set(), display: clean, occurrences: 0 };
        map[key].occurrences++;
        // On garde la forme display la plus "propre" : acronyme prioritaire,
        // sinon capitalisation de la 1re occurrence.
        if (isAcronym && !/^[A-Z]{2,6}$/.test(map[key].display)) {
          map[key].display = clean;
        }
      });
    });
    for (const e of localEntities) map[e].sources.add(idx);
  });

  return Object.values(map)
    .map((e) => ({
      label: e.display,
      hits: e.sources.size,
      total,
      totalOccurrences: e.occurrences,
    }))
    .filter((e) => e.hits >= Math.max(3, Math.ceil(total * 0.3)))
    .sort((a, b) => b.hits - a.hits || b.totalOccurrences - a.totalOccurrences)
    .slice(0, 15);
}

// ─── Opportunités de différentiation ────────────────────────────────────────

/**
 * Détecte les questions PAA peu couvertes par les concurrents : opportunité
 * pour le rédacteur de traiter un angle que la SERP ignore.
 *
 * Heuristique : pour chaque PAA, on extrait les mots significatifs (length
 * ≥ 4, hors stopwords). Une page "couvre" la question si au moins la moitié
 * des mots-clés significatifs apparaissent dans son texte. Si moins de 30%
 * des concurrents couvrent → opportunité.
 *
 * Limite : matching lexical, pas sémantique. Une question reformulée
 * différemment peut être ratée. Pour V2, utiliser embeddings bge-m3 sur
 * les PAA vs headings concurrents pour matcher par similarité.
 */
export function detectOpportunities(
  paa: Paa[],
  pageContents: PageContent[],
): Opportunity[] {
  if (pageContents.length === 0 || paa.length === 0) return [];
  const opps: Opportunity[] = [];
  for (const q of paa) {
    const qWords = q.question
      .toLowerCase()
      .replace(/[^\wà-ÿ\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    if (qWords.length < 2) continue;
    let covered = 0;
    for (const p of pageContents) {
      const t = p.text.toLowerCase();
      const matched = qWords.filter((w) => t.includes(w)).length;
      if (matched >= Math.max(2, Math.ceil(qWords.length * 0.5))) covered++;
    }
    const pct = covered / pageContents.length;
    if (pct < 0.3) {
      opps.push({
        type: "paa",
        text: q.question,
        competitorCoverage: Math.round(pct * 100),
      });
    }
  }
  // Tri par couverture croissante (les plus uniques en premier)
  return opps.sort((a, b) => a.competitorCoverage - b.competitorCoverage).slice(0, 6);
}

// ─── Détection d'intent ──────────────────────────────────────────────────────

/**
 * Patterns linguistiques pour détecter l'intent depuis le keyword.
 */
const INTENT_PATTERNS: Record<string, string[]> = {
  transactional: [
    "acheter", "achat", "prix", "pas cher", "moins cher", "promo",
    "soldes", "vente", "discount", "promotion", "remise", "à vendre",
    "code promo", "boutique", "commander", "livraison", "tarif", "coût",
  ],
  informational: [
    "comment", "pourquoi", "quand", "où", "qu est-ce", "quoi",
    "définition", "guide", "tutoriel", "explication", "signification",
    "principe", "histoire", "origine", "exemple", "explique",
  ],
  commercial: [
    "meilleur", "meilleure", "meilleurs", "meilleures",
    "top", "comparatif", "comparaison", "comparer",
    "avis", "test", "review", "alternative", "vs",
  ],
};

/**
 * Domaines connus par catégorie pour analyser la SERP.
 */
const COMMERCE_DOMAINS = new Set([
  "amazon.fr", "amazon.com", "cdiscount.com", "fnac.com", "darty.com",
  "boulanger.com", "leclerc.com", "carrefour.fr", "auchan.fr",
  "zalando.fr", "sarenza.com", "spartoo.com", "asics.com", "courir.com",
  "decathlon.fr", "go-sport.com", "intersport.fr", "shopify.com",
  "etsy.com", "ebay.fr", "rakuten.com", "veepee.com", "showroomprive.com",
  "wethenew.com", "sportshowroom.fr", "thelaststep.fr",
]);
const COMPARE_DOMAINS = ["idealo.fr", "leguide.com", "lesfurets.com",
  "monchoix.com", "comparateur", "ledenicheur.fr"];
const INFO_DOMAINS = new Set([
  "wikipedia.org", "wikipedia.fr", "fandom.com", "lemonde.fr", "lefigaro.fr",
  "lesnumeriques.com", "journaldunet.com", "futura-sciences.com",
  "doctissimo.fr", "ameli.fr", "service-public.fr", "legifrance.gouv.fr",
]);

const FR_CITIES = new Set([
  "paris", "lyon", "marseille", "lille", "bordeaux", "toulouse",
  "nice", "nantes", "strasbourg", "montpellier", "rennes", "reims",
  "rouen", "dijon", "brest", "grenoble", "tours", "nancy", "metz",
  "annecy", "clermont", "biarritz", "perpignan", "limoges",
]);

export function detectIntent(keyword: string, results: SerpResult[]): Intent {
  const kw = keyword.toLowerCase().trim();
  const tokens = kw.split(/\s+/);

  // 1. Patterns linguistiques (priorité haute, signal fort)
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const p of patterns) {
      if (kw.includes(p) || tokens.includes(p)) {
        return intent as Intent;
      }
    }
  }

  // 2. Local : ville française dans le keyword
  if (tokens.some((t) => FR_CITIES.has(t))) return "local";

  // 3. Analyse domaines top 10 (signal moyen)
  const domains = results
    .map((r) => {
      try {
        return new URL(r.link).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  let commerceCount = 0;
  let infoCount = 0;
  let compareCount = 0;
  for (const d of domains) {
    if (COMMERCE_DOMAINS.has(d) || Array.from(COMMERCE_DOMAINS).some((cd) => d.endsWith("." + cd))) {
      commerceCount++;
    }
    if (INFO_DOMAINS.has(d) || Array.from(INFO_DOMAINS).some((id) => d.endsWith("." + id))) {
      infoCount++;
    }
    if (COMPARE_DOMAINS.some((cd) => d.includes(cd))) compareCount++;
  }
  const total = domains.length || 1;
  if (commerceCount / total >= 0.3) return "transactional";
  if (compareCount / total >= 0.3) return "commercial";
  if (infoCount / total >= 0.3) return "informational";

  // 4. Default : navigational si keyword très court (1-2 mots), sinon
  // informational.
  if (tokens.length <= 2 && tokens.every((t) => t.length >= 3)) {
    return "navigational";
  }
  return "informational";
}

// ─── Embeddings sémantiques (Cloudflare Workers AI / bge-m3) ─────────────────

/**
 * Enrichit un NlpResult avec :
 *   1. Un score de similarité sémantique au keyword principal pour chaque
 *      nlpTerm (cosine sim entre embeddings bge-m3)
 *   2. Un clustering thématique des termes par groupes de champ lexical
 *      via threshold cosine 0.62
 *   3. Un re-rank des nlpTerms par mix presence + sem avec pénalité noise
 *
 * Modèle : `@cf/baai/bge-m3` (1024 dimensions, multilingue, gratuit dans
 * Workers AI). Un seul appel batch pour le keyword + tous les nlpTerms
 * (limité aux 50 premiers pour borner les tokens).
 *
 * Sans binding AI, retourne le NlpResult inchangé (mode dégradé).
 */
export async function enrichWithSemantic(
  nlp: NlpResult,
  keyword: string,
  ai: Ai | undefined,
): Promise<NlpResult> {
  if (!ai || !keyword) return nlp;
  const terms = nlp.nlpTerms.slice(0, 50);
  if (terms.length === 0) return nlp;

  try {
    const t0 = Date.now();
    const inputs = [keyword, ...terms.map((t) => t.term)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await ai.run("@cf/baai/bge-m3" as any, { text: inputs })) as {
      data?: number[][];
      shape?: number[];
    };
    const embeddings = result.data;
    if (!embeddings || embeddings.length !== inputs.length) {
      console.warn("[ai] embeddings count mismatch:", embeddings?.length, "vs", inputs.length);
      return nlp;
    }

    const kwEmb = embeddings[0];
    const termEmbs = embeddings.slice(1);
    const enrichedTerms: NlpTerm[] = terms.map((t, i) => ({
      ...t,
      semanticScore: cosineSimilarity(kwEmb, termEmbs[i]),
    }));

    // Fusion sémantique des quasi-doublons (cosine ≥ 0.92) qu'on n'a pas pu
    // attraper avec le fingerprint stopword (cf. dedup runNLP). Ex : "sneakers"
    // / "baskets" ont des fingerprints différents mais sont sémantiquement
    // équivalents. On garde le terme avec le meilleur score comme représentant
    // et on consolide les autres dans `variants`.
    const { terms: mergedTerms, embs: mergedEmbs } = mergeNearDuplicateTerms(
      enrichedTerms,
      termEmbs,
      0.92,
    );

    const clusters = clusterTermsByEmbedding(mergedTerms, mergedEmbs, 0.62);

    // Re-rank par mix presence + semanticScore : un terme idéal est BIEN
    // présent chez les concurrents ET sémantiquement lié au keyword. Pénalité
    // forte pour les termes haute presence + sem très basse (probablement du
    // noise web généraliste).
    const rerankedTop50 = mergedTerms
      .map((t) => {
        const sem = t.semanticScore ?? 0.4;
        let combinedScore = (t.presence / 100) * 0.5 + sem * 0.5;
        if (t.presence >= 70 && sem < 0.3) combinedScore *= 0.4;
        return { ...t, _rerank: combinedScore };
      })
      .sort((a, b) => b._rerank - a._rerank)
      .map((t) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _rerank, ...rest } = t;
        return rest as NlpTerm;
      });

    console.log(
      `[ai] embeddings ok in ${Date.now() - t0}ms : ${rerankedTop50.length} terms, ${clusters.length} clusters`,
    );

    return {
      ...nlp,
      nlpTerms: rerankedTop50.concat(nlp.nlpTerms.slice(50)),
      semanticClusters: clusters,
    };
  } catch (err) {
    console.error("[ai] enrichWithSemantic failed:", err);
    return nlp;
  }
}

/**
 * Fusion des paires/groupes de termes dont la cosine similarity dépasse un
 * seuil très haut (typiquement 0.92). Le représentant est le terme au meilleur
 * `presence × semanticScore`, les autres sont ajoutés à ses `variants`. Les
 * compteurs (presence, avgCount, minCount, maxCount) sont mergés en max pour
 * ne pas perdre d'info.
 *
 * Renvoie aussi le tableau d'embeddings filtré pour rester aligné avec les
 * termes restants.
 */
function mergeNearDuplicateTerms(
  terms: NlpTerm[],
  embs: number[][],
  threshold: number,
): { terms: NlpTerm[]; embs: number[][] } {
  const merged: NlpTerm[] = [];
  const mergedEmbs: number[][] = [];
  const assigned = new Set<number>();
  for (let i = 0; i < terms.length; i++) {
    if (assigned.has(i)) continue;
    const groupIdx = [i];
    assigned.add(i);
    for (let j = i + 1; j < terms.length; j++) {
      if (assigned.has(j)) continue;
      if (cosineSimilarity(embs[i], embs[j]) >= threshold) {
        groupIdx.push(j);
        assigned.add(j);
      }
    }
    if (groupIdx.length === 1) {
      merged.push(terms[i]);
      mergedEmbs.push(embs[i]);
      continue;
    }
    // Fusion : représentant = celui avec le meilleur presence × semanticScore.
    const group = groupIdx.map((idx) => ({ term: terms[idx], emb: embs[idx] }));
    const ranked = group
      .slice()
      .sort(
        (a, b) =>
          b.term.presence * (b.term.semanticScore ?? 0.5) -
          a.term.presence * (a.term.semanticScore ?? 0.5),
      );
    const winner = ranked[0];
    const others = ranked.slice(1).map((r) => r.term);
    const consolidatedVariants = Array.from(
      new Set([
        ...(winner.term.variants ?? []),
        ...others.map((o) => o.term),
        ...others.flatMap((o) => o.variants ?? []),
      ]),
    );
    merged.push({
      ...winner.term,
      variants: consolidatedVariants,
      // On prend le max de chaque métrique : c'est l'expression la plus forte
      // de cette idée sémantique chez les concurrents.
      presence: Math.max(...group.map((g) => g.term.presence)),
      avgCount: Math.max(...group.map((g) => g.term.avgCount)),
      minCount: Math.max(...group.map((g) => g.term.minCount)),
      maxCount: Math.max(...group.map((g) => g.term.maxCount)),
    });
    mergedEmbs.push(winner.emb);
  }
  return { terms: merged, embs: mergedEmbs };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Clustering threshold-based : prend chaque terme non-assigné comme seed,
 * agrège tous les termes restants au-dessus du threshold cosine, marque
 * comme assignés. Garde uniquement les clusters de 2+ termes.
 *
 * Threshold 0.62 : empiriquement trouvé pour bge-m3 sur du français.
 */
function clusterTermsByEmbedding(
  terms: NlpTerm[],
  embs: number[][],
  threshold: number,
): SemanticCluster[] {
  const clusters: { members: number[] }[] = [];
  const assigned = new Set<number>();
  for (let i = 0; i < terms.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = { members: [i] };
    assigned.add(i);
    for (let j = i + 1; j < terms.length; j++) {
      if (assigned.has(j)) continue;
      if (cosineSimilarity(embs[i], embs[j]) >= threshold) {
        cluster.members.push(j);
        assigned.add(j);
      }
    }
    if (cluster.members.length >= 2) clusters.push(cluster);
  }
  return clusters
    .map((c) => {
      const members = c.members.map((i) => terms[i]);
      // Filtre cluster de "noise" : avgSem trop basse = mots vagues sans
      // lien thématique au keyword (ex "point/question/début").
      const avgSem =
        members.reduce((s, m) => s + (m.semanticScore ?? 0), 0) / members.length;
      // Label = terme le plus représentatif. Ne pas commencer par
      // stopword/préposition pour avoir un label parlant ("améliorer seo"
      // plutôt que "pour améliorer").
      const labelCandidates = members.slice().sort((a, b) => {
        const aStartsBad =
          NGRAM_BAD_START.has(a.term.split(" ")[0]) ||
          NGRAM_KEEP_STOPWORDS.has(a.term.split(" ")[0])
            ? 1
            : 0;
        const bStartsBad =
          NGRAM_BAD_START.has(b.term.split(" ")[0]) ||
          NGRAM_KEEP_STOPWORDS.has(b.term.split(" ")[0])
            ? 1
            : 0;
        if (aStartsBad !== bStartsBad) return aStartsBad - bStartsBad;
        return (
          b.presence * (b.semanticScore ?? 0.5) -
          a.presence * (a.semanticScore ?? 0.5)
        );
      });
      const labelTerm = labelCandidates[0];
      return {
        label: labelTerm.term,
        terms: members.map((m) => m.term),
        avgSem,
      };
    })
    .filter((c) => c.avgSem >= 0.35)
    .sort((a, b) => b.terms.length - a.terms.length)
    .slice(0, 10)
    .map(({ label, terms }) => ({ label, terms }));
}
