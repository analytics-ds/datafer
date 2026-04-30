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
  h1?: string[];
  h2?: string[];
  h3?: string[];
  // Plan complet dans l'ordre du document (H1 → H2 → H3 → H2 → ...).
  outline?: Heading[];
  // Score SEO /100 du concurrent (même algo que celui appliqué à la rédaction
  // côté éditeur). Calculé une fois au moment de la création du brief.
  score?: number;
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
};

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
  nlpTerms: NlpTerm[];
  sections?: Section[];
  entities?: Entity[];
  avgWordCount: number;
  avgHeadings: number;
  avgParagraphs: number;
  minWordCount: number;
  maxWordCount: number;
};

// ─── SERPAPI ─────────────────────────────────────────────────────────────────

type SerpRaw = {
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

async function fetchSerpPage(
  keyword: string,
  gl: string,
  hl: string,
  apiKey: string,
  start: number,
  num: number,
): Promise<SerpRaw | null> {
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
  const d = (await r.json()) as SerpRaw;
  if (d.error) return null;
  return d;
}

export async function fetchSerp(
  keyword: string,
  country: string,
  apiKey: string,
): Promise<{ results: SerpResult[]; allResults: SerpResult[]; paa: Paa[] }> {
  const gl = country === "uk" ? "gb" : country;
  const hl = ["us", "uk"].includes(country) ? "en" : country;

  // Premier appel : num=100 pour récupérer le top 100 (utile pour
  // findDomainPosition au-delà du top 10).
  const first = await fetchSerpPage(keyword, gl, hl, apiKey, 0, 100);
  if (!first) return { results: [], allResults: [], paa: [] };

  let allRaw = first.organic_results ?? [];
  const paa: Paa[] = (first.related_questions ?? []).map((q) => ({
    question: q.question ?? "",
    snippet: q.snippet ?? "",
    link: q.link ?? "",
  }));

  // Si Google a inséré des blocs spéciaux (PAA, featured snippet, vidéos…)
  // on peut se retrouver avec moins de 10 organic_results sur la page 1.
  // On pagine alors la SERP pour combler jusqu'à 10.
  let start = allRaw.length;
  let attempts = 0;
  while (allRaw.length < 10 && attempts < 2) {
    attempts++;
    const next = await fetchSerpPage(keyword, gl, hl, apiKey, start, 10);
    if (!next) break;
    const more = next.organic_results ?? [];
    if (more.length === 0) break;
    allRaw = [...allRaw, ...more];
    start += more.length;
  }

  const allResults = allRaw.map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? "",
    displayed_link: r.displayed_link ?? r.link ?? "",
  }));
  // Top 10 utilisé pour le crawl + NLP. allResults sert à findDomainPosition.
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

export async function crawlPage(url: string): Promise<PageContent | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": GOOGLEBOT_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        From: "googlebot(at)googlebot.com",
      },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const html = await r.text();
    const truncated = html.length > 2_000_000 ? html.slice(0, 2_000_000) : html;
    return parseHTML(truncated);
  } catch {
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
 * filtre produit, popup cookie, social share…). On match large mais avec
 * des word boundaries pour ne pas attraper « narrative » via "nav".
 */
const NOISE_CLASS_RE =
  /\b(?:menu|navbar|navigation|sidebar|breadcrumb|cookie|newsletter|share|socials?|related|comments?|advert|ads?|popup|modal|search-form|filter[s_-]|sponsor|widget|dropdown|tooltip|skip-link|skip-to|cart|wishlist|recently[-_]viewed)\b/i;

function parseHTML(html: string): PageContent {
  // Si la page contient un <main>/<article> (ou attribut équivalent), on
  // restreint l'extraction à ce sous-arbre. Sinon on parse tout en filtrant
  // les zones noise.
  const hasMainRegion =
    /<main\b|<article\b|role=["']main["']|itemprop=["']articleBody["']/i.test(html);

  const headings: Heading[] = [];
  const paragraphs: string[] = []; // textes extraits par paragraphe
  let currentHeading: { level: 1 | 2 | 3; text: string } | null = null;
  let currentParagraph = "";
  let pCount = 0;

  // Stack des profondeurs où l'on est entré en zone noise : on sort dès
  // qu'on referme la balise correspondante.
  const noiseStack: number[] = [];
  const isInNoise = () => noiseStack.length > 0;

  // Profondeur du <main>/<article> où l'on a commencé à collecter
  // (-1 = on n'est pas encore dedans, ≥0 = on est dedans). Ignoré si
  // hasMainRegion est false.
  let mainStartDepth = -1;
  let depth = 0;

  // Si hasMainRegion : on collecte uniquement à partir du moment où on
  // entre dans le main/article. Sinon on collecte dès le départ.
  let collecting = !hasMainRegion;

  const flushParagraph = () => {
    const t = currentParagraph.replace(/\s+/g, " ").trim();
    if (t) paragraphs.push(t);
    currentParagraph = "";
  };

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        depth++;
        const lower = name.toLowerCase();

        // Détection main/article : on commence à collecter ici.
        if (
          !collecting &&
          (lower === "main" ||
            lower === "article" ||
            attrs.role === "main" ||
            attrs.itemprop === "articleBody")
        ) {
          collecting = true;
          mainStartDepth = depth;
        }

        // Tag noise → on entre dans une zone à ignorer.
        if (NOISE_TAGS.has(lower)) {
          noiseStack.push(depth);
          return;
        }

        // Class/id noise → idem.
        const cls = `${attrs.class ?? ""} ${attrs.id ?? ""}`;
        if (cls.trim() && NOISE_CLASS_RE.test(cls)) {
          noiseStack.push(depth);
          return;
        }

        if (!collecting || isInNoise()) return;

        if (lower === "h1" || lower === "h2" || lower === "h3") {
          flushParagraph();
          const lvl = parseInt(lower.slice(1), 10) as 1 | 2 | 3;
          currentHeading = { level: lvl, text: "" };
          return;
        }
        if (lower === "p") {
          flushParagraph();
          pCount++;
        }
      },

      ontext(text) {
        if (!collecting || isInNoise()) return;
        if (currentHeading) {
          currentHeading.text += text;
        } else {
          currentParagraph += text;
        }
      },

      onclosetag(name) {
        const lower = name.toLowerCase();

        // Sortie d'une zone noise : pop si on est exactement à la même
        // profondeur que celle où on est rentré.
        if (noiseStack.length > 0 && noiseStack[noiseStack.length - 1] === depth) {
          noiseStack.pop();
          depth--;
          return;
        }

        if (currentHeading && (lower === "h1" || lower === "h2" || lower === "h3")) {
          const t = currentHeading.text.replace(/\s+/g, " ").trim();
          if (t) {
            headings.push({ level: currentHeading.level, text: t });
            // Le texte du heading nourrit aussi le corpus global
            // (utile pour la NLP / TF-IDF).
            paragraphs.push(t);
          }
          currentHeading = null;
        }

        if (lower === "p") {
          flushParagraph();
        }

        // Sortie du <main>/<article> qu'on suivait : on arrête de collecter
        // (un site peut avoir un footer après le main, on l'ignore).
        if (mainStartDepth > 0 && depth === mainStartDepth) {
          collecting = false;
          mainStartDepth = -1;
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

  return {
    text,
    h1,
    h2,
    h3,
    outline: headings,
    headings: headings.length,
    paragraphs: pCount || paragraphs.length,
    wordCount,
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
 * Stemmer français simplifié (inspiré Snowball, sans les règles avancées de
 * mutations consonantiques). Réduit les mots à leur radical pour regrouper
 * les familles morphologiques (travaux / travail / travaille / travaillé).
 * Suffixes testés dans l'ordre du plus long au plus court.
 */
function frenchStem(w: string): string {
  const word = w.toLowerCase();
  if (word.length <= 4) return word;
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
    // Tokens des titres : stemmés, pour le boost en scoring
    [...(c.h1 ?? []), ...(c.h2 ?? [])].forEach((h) => {
      h.toLowerCase()
        .replace(/[^a-zà-ÿ0-9\s-]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .forEach((w) => headingStems.add(frenchStem(w)));
    });
    const rawWords = c.text
      .toLowerCase()
      .replace(/[^a-zà-ÿ0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !WEB_NOISE.has(w));
    // Séquence stemmée pour générer les n-grammes
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

    // Bigrammes (non stemmés, pour lisibilité)
    for (let i = 0; i < rawWords.length - 1; i++) {
      const bg = rawWords[i] + " " + rawWords[i + 1];
      tf[bg] = (tf[bg] ?? 0) + 1;
      if (!seen.has(bg)) {
        docFreq[bg] = (docFreq[bg] ?? 0) + 1;
        seen.add(bg);
      }
    }

    // Trigrammes (non stemmés) : capture des expressions métier type
    // "crédit impôt transition", "agence nationale habitat".
    for (let i = 0; i < rawWords.length - 2; i++) {
      const tg = rawWords[i] + " " + rawWords[i + 1] + " " + rawWords[i + 2];
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
        // Évite les n-grams qui répètent le même mot (artefact)
        if (new Set(parts).size === 1) return false;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
    .map(({ _key, ...rest }) => rest as NlpTerm);

  const avg = (arr: PageContent[], fn: (c: PageContent) => number) =>
    arr.length ? Math.round(arr.reduce((s, c) => s + fn(c), 0) / arr.length) : 0;

  const avgWC = avg(valid, (c) => c.wordCount) || 1500;
  const sections = detectCompetitorSections(valid, kwStems);
  const entities = detectNamedEntities(valid);
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
    nlpTerms,
    sections,
    entities,
    avgWordCount: avgWC,
    avgHeadings: avg(valid, (c) => c.headings) || 8,
    avgParagraphs: avg(valid, (c) => c.paragraphs) || 15,
    minWordCount: Math.round(avgWC * 0.7),
    maxWordCount: Math.round(avgWC * 1.3),
  };
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
