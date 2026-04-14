/**
 * Analyse complète d'un mot-clé : SERPAPI → crawl top 10 → TF-IDF + benchmarks → Haloscan.
 *
 * Portée depuis le HTML original (seo-forge-v4.html) avec deux différences :
 *   - `parseHTML` utilise des regex au lieu de DOMParser (non dispo sur Workers)
 *   - Les appels HTTP sont directs (pas de proxy CORS, on est server-side)
 */

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
};

export type Paa = { question: string; snippet: string; link: string };

export type PageContent = {
  text: string;
  h1: string[];
  h2: string[];
  h3: string[];
  headings: number;
  paragraphs: number;
  wordCount: number;
};

export type NlpTerm = {
  term: string;
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
  avgWordCount: number;
  avgHeadings: number;
  avgParagraphs: number;
  minWordCount: number;
  maxWordCount: number;
};

// ─── SERPAPI ─────────────────────────────────────────────────────────────────

export async function fetchSerp(
  keyword: string,
  country: string,
  apiKey: string,
): Promise<{ results: SerpResult[]; paa: Paa[] }> {
  const gl = country === "uk" ? "gb" : country;
  const hl = ["us", "uk"].includes(country) ? "en" : country;
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(keyword)}&gl=${gl}&hl=${hl}&num=10&api_key=${apiKey}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return { results: [], paa: [] };
  const d = (await r.json()) as {
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
  if (d.error) return { results: [], paa: [] };
  const results = (d.organic_results ?? []).slice(0, 10).map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? "",
    displayed_link: r.displayed_link ?? r.link ?? "",
  }));
  const paa = (d.related_questions ?? []).map((q) => ({
    question: q.question ?? "",
    snippet: q.snippet ?? "",
    link: q.link ?? "",
  }));
  return { results, paa };
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
  /**
   * Haloscan ne renvoie actuellement pas les métriques volume/CPC/difficulté
   * via /api/keywords/overview avec notre plan. On conserve quand même le
   * champ pour quand ces données deviendront disponibles via un autre
   * endpoint ou une évolution de l'API.
   */
  search_volume?: number;
  cpc?: number;
  competition?: number;
  difficulty?: number;
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
      headers: {
        "haloscan-api-key": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyword,
        country: gl,
        requested_data: ["serp"],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const raw = (await r.json()) as {
      keyword?: string;
      serp?: { results?: { serp_date?: string; serp?: unknown[] }; result_count?: number };
      errors?: unknown[];
      search_volume?: number;
      cpc?: number;
      competition?: number;
      difficulty?: number;
    };
    const serp = raw.serp?.results;
    return {
      keyword: raw.keyword ?? keyword,
      serpDate: serp?.serp_date,
      resultCount: raw.serp?.result_count ?? null,
      search_volume: raw.search_volume,
      cpc: raw.cpc,
      competition: raw.competition,
      difficulty: raw.difficulty,
    };
  } catch {
    return null;
  }
}

// ─── Crawl + parse HTML ──────────────────────────────────────────────────────

export async function crawlPage(url: string): Promise<PageContent | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DatashakeDataferBot/1.0; +https://datashake.fr)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const html = await r.text();
    return parseHTML(html);
  } catch {
    return null;
  }
}

function parseHTML(html: string): PageContent {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const h1 = extractTag(cleaned, "h1");
  const h2 = extractTag(cleaned, "h2");
  const h3 = extractTag(cleaned, "h3");

  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : cleaned;

  const text = bodyHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const paragraphs = (bodyHtml.match(/<p[\s>]/gi) ?? []).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    text,
    h1,
    h2,
    h3,
    headings: h1.length + h2.length + h3.length,
    paragraphs,
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
  "le la les de du des un une et en est que qui dans pour ce il elle ne pas plus son sur au aux avec se par nous vous ils elles on être avoir faire dire aller tout comme mais ou si leur même ces entre sans aussi autre ses très bien fait été cette dont encore peu alors peut the a an and or but in on at to for of with by is are was were be been have has had do does did will would could should may might can shall not no so than that this these those from it its they their them he she his her we our you your i my me us him which who whom what when where how all each every both few more most other some such only own same too very just about above after again before below between down up out off over under further then once here there why any also can more".split(" "),
);

const WEB_NOISE = new Set(
  "site web page article contenu lire suite voir plus accueil menu contact cookie cookies politique confidentialité mentions légales droits réservés tous copyright newsletter inscription email commentaire commentaires partager partage facebook twitter linkedin instagram youtube recherche rechercher cliquer cliquez lien liens télécharger download click here read more share follow subscribe login register sign home about blog news skip content main navigation footer sidebar widget category tag archive previous next post related popular recent comments leave reply name email website submit search results found showing page pages back top scroll www http https html css javascript php wordpress site web webpage website online digital internet click button form input select option".split(" "),
);

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

  // Semantic NLP (TF-IDF)
  const docFreq: Record<string, number> = {};
  const allTerms: Array<{ tf: Record<string, number>; total: number }> = [];
  const headingTerms = new Set<string>();

  contents.forEach((c) => {
    if (!c || !c.text) return;
    [...(c.h1 ?? []), ...(c.h2 ?? [])].forEach((h) => {
      h.toLowerCase()
        .replace(/[^a-zà-ÿ0-9\s-]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .forEach((w) => headingTerms.add(w));
    });
    const words = c.text
      .toLowerCase()
      .replace(/[^a-zà-ÿ0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !WEB_NOISE.has(w));
    const tf: Record<string, number> = {};
    const seen = new Set<string>();
    words.forEach((w) => {
      tf[w] = (tf[w] ?? 0) + 1;
      if (!seen.has(w)) {
        docFreq[w] = (docFreq[w] ?? 0) + 1;
        seen.add(w);
      }
    });
    for (let i = 0; i < words.length - 1; i++) {
      const bg = words[i] + " " + words[i + 1];
      tf[bg] = (tf[bg] ?? 0) + 1;
      if (!seen.has(bg)) {
        docFreq[bg] = (docFreq[bg] ?? 0) + 1;
        seen.add(bg);
      }
    }
    allTerms.push({ tf, total: words.length });
  });

  const tfidf: Record<string, number> = {};
  allTerms.forEach(({ tf, total }) => {
    Object.entries(tf).forEach(([t, f]) => {
      tfidf[t] = (tfidf[t] ?? 0) + (f / total) * Math.log((n + 1) / (docFreq[t] ?? 1));
    });
  });

  const nlpTerms: NlpTerm[] = Object.entries(tfidf)
    .map(([term, score]) => {
      const df = docFreq[term] ?? 0;
      const presence = df / n;
      const headingBoost = term.split(" ").some((w) => headingTerms.has(w)) ? 1.4 : 1;
      const relevance = score * (0.3 + 0.7 * presence) * headingBoost;

      // Distribution d'occurrences chez les concurrents qui EMPLOIENT le terme
      // (on ignore les pages à 0 occurrence pour ne pas écraser la fourchette).
      const counts: number[] = [];
      for (const d of allTerms) {
        const c = d.tf[term];
        if (c && c > 0) counts.push(c);
      }
      counts.sort((a, b) => a - b);
      const minCount = counts.length ? counts[0] : 0;
      const maxCount = counts.length ? counts[counts.length - 1] : 0;
      const avgCount = counts.length
        ? Math.round(counts.reduce((s, c) => s + c, 0) / counts.length)
        : 0;

      return {
        term,
        score: relevance,
        presence: Math.round(presence * 100),
        df,
        inHeadings: headingBoost > 1,
        minCount,
        maxCount,
        avgCount,
      };
    })
    .filter((k) => {
      if (kwVariations.has(k.term)) return false;
      if (k.presence < 15) return false;
      if (!k.term.includes(" ") && k.term.length <= 3) return false;
      if (WEB_NOISE.has(k.term)) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const avg = (arr: PageContent[], fn: (c: PageContent) => number) =>
    arr.length ? Math.round(arr.reduce((s, c) => s + fn(c), 0) / arr.length) : 0;

  const avgWC = avg(valid, (c) => c.wordCount) || 1500;
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
    avgWordCount: avgWC,
    avgHeadings: avg(valid, (c) => c.headings) || 8,
    avgParagraphs: avg(valid, (c) => c.paragraphs) || 15,
    minWordCount: Math.round(avgWC * 0.7),
    maxWordCount: Math.round(avgWC * 1.3),
  };
}
