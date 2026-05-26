import { Parser } from "htmlparser2";
import { brightDataFetch, looksLikeChallengePage, type BrightDataEnv } from "./brightdata-fetch";
import type { SitemapUrl } from "./types";

const FETCH_TIMEOUT_MS = 15000;
const MAX_DEPTH = 3;
const MAX_URLS = 100_000;
const MAX_SITEMAP_BYTES = 20 * 1024 * 1024;

// Parse un sitemap XML (urlset OU sitemapindex) et retourne la liste à plat
// des URLs finales. Suit les sitemap index récursivement (depth max 3).
//
// Robuste à :
// - Sitemap sans déclaration XML
// - Sitemap.xml.gz (refuse, on prend que les non compressés)
// - Mélange urlset/sitemapindex
// - URLs sans <lastmod>
// - HTML servi à la place du XML (retourne [])
// - Sites protégés (Datadome, etc.) qui répondent 403 sur fetch direct :
//   fallback Bright Data Web Unlocker si BRIGHTDATA_TOKEN configuré.
//
// Ne lit pas <lastmod> pour la décision de fraîcheur : c'est volontaire,
// on s'appuie sur HEAD + hash de contenu côté sync (cf. sync.ts).
export async function fetchAndParseSitemap(
  rootUrl: string,
  env: BrightDataEnv = {},
): Promise<SitemapUrl[]> {
  const seen = new Set<string>();
  const out: SitemapUrl[] = [];

  // 1. Tente d'abord l'URL fournie par l'utilisateur.
  await walk(rootUrl, 0, seen, out, env);
  if (out.length > 0) return out;

  // 2. Si rien, lance une discovery automatique : on tente plusieurs
  // typologies courantes + on parse le robots.txt pour les directives
  // Sitemap:. Couvre les CMS qui exposent leur sitemap sous un nom
  // différent du défaut (sitemap_index.xml pour WordPress/Yoast,
  // sitemap-index.xml pour certains Salesforce, multi-sitemap par section,
  // etc.).
  const discovered = await discoverSitemapCandidates(rootUrl, env);
  for (const candidate of discovered) {
    if (out.length >= MAX_URLS) break;
    if (seen.has(candidate)) continue;
    await walk(candidate, 0, seen, out, env);
    if (out.length > 0) {
      console.log(`[maillage] sitemap discovered via fallback url=${candidate} urls=${out.length}`);
      return out;
    }
  }
  return out;
}

// Candidates classiques explorés par toutes les typologies de CMS.
const COMMON_SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap1.xml",
  "/sitemap/sitemap.xml",
  "/wp-sitemap.xml",
  "/sitemap.aspx",
  "/sitemaps/sitemap.xml",
];

// Cherche tous les sitemaps possibles à partir d'une URL de base ou d'un
// sitemap qui a échoué. Stratégie :
//   1. Parse robots.txt pour les lignes "Sitemap: ..." (RFC standard).
//   2. Probe les chemins communs sur le hostname.
// Retourne les URLs candidates dans l'ordre de priorité.
async function discoverSitemapCandidates(
  rootUrl: string,
  env: BrightDataEnv,
): Promise<string[]> {
  let base: URL;
  try {
    base = new URL(rootUrl);
  } catch {
    return [];
  }

  const candidates: string[] = [];
  const seen = new Set<string>([rootUrl]);

  // Lignes Sitemap: du robots.txt (souvent l'info la plus fiable).
  const robotsSitemaps = await parseRobotsSitemaps(base.origin, env);
  for (const u of robotsSitemaps) {
    if (!seen.has(u)) {
      candidates.push(u);
      seen.add(u);
    }
  }

  // Chemins communs sur le hostname.
  for (const path of COMMON_SITEMAP_PATHS) {
    const u = `${base.origin}${path}`;
    if (!seen.has(u)) {
      candidates.push(u);
      seen.add(u);
    }
  }

  console.log(`[maillage] sitemap discovery candidates=${candidates.length} base=${base.origin}`);
  return candidates;
}

async function parseRobotsSitemaps(origin: string, env: BrightDataEnv): Promise<string[]> {
  const robotsUrl = `${origin}/robots.txt`;
  let body: string | null = null;
  try {
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "DataferSitemapBot/1.0 (+https://datafer.analytics-e0d.workers.dev)" },
      redirect: "follow",
    });
    if (res.ok) {
      const txt = await res.text();
      if (txt.length < 1_000_000) body = txt;
    }
  } catch {
    // ignore, on tentera BD
  }
  if (!body && env.BRIGHTDATA_TOKEN && env.BRIGHTDATA_ZONE) {
    body = await brightDataFetch(robotsUrl, env, { timeoutMs: 20000 });
  }
  if (!body) return [];

  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(.+)$/i);
    if (m) {
      const url = m[1].trim();
      try {
        new URL(url);
        out.push(url);
      } catch {
        // skip invalid URL
      }
    }
  }
  if (out.length > 0) {
    console.log(`[maillage] robots.txt sitemaps found=${out.length} origin=${origin}`);
  }
  return out;
}

async function fetchSitemapXml(sitemapUrl: string, env: BrightDataEnv): Promise<string | null> {
  // 1. Fetch direct
  try {
    const res = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "application/xml, text/xml, */*;q=0.5",
        "User-Agent": "DataferSitemapBot/1.0 (+https://datafer.analytics-e0d.workers.dev)",
      },
      redirect: "follow",
    });
    if (res.ok) {
      const contentLength = Number(res.headers.get("content-length") || 0);
      if (contentLength > MAX_SITEMAP_BYTES) {
        console.log(`[maillage] sitemap too large bytes=${contentLength} url=${sitemapUrl}`);
        return null;
      }
      const body = await res.text();
      if (body.length > MAX_SITEMAP_BYTES) {
        console.log(`[maillage] sitemap too large after read bytes=${body.length} url=${sitemapUrl}`);
        return null;
      }
      // Si le serveur a répondu 200 avec une page de challenge à la place
      // du XML attendu, on bascule sur BD comme si c'était un 403.
      if (!looksLikeChallengePage(body)) {
        return body;
      }
      console.log(`[maillage] sitemap direct ok-but-challenge url=${sitemapUrl}`);
    } else {
      console.log(`[maillage] sitemap direct fail ${res.status} url=${sitemapUrl}`);
    }
  } catch (e) {
    console.log(`[maillage] sitemap direct error url=${sitemapUrl} err=${(e as Error).message}`);
  }

  // 2. Fallback Bright Data Web Unlocker pour les sites protégés
  if (env.BRIGHTDATA_TOKEN && env.BRIGHTDATA_ZONE) {
    const body = await brightDataFetch(sitemapUrl, env);
    if (body && body.length > 0 && !looksLikeChallengePage(body)) {
      if (body.length > MAX_SITEMAP_BYTES) {
        console.log(`[maillage] sitemap BD too large bytes=${body.length} url=${sitemapUrl}`);
        return null;
      }
      console.log(`[maillage] sitemap via BD ok url=${sitemapUrl} bytes=${body.length}`);
      return body;
    }
    console.log(`[maillage] sitemap BD KO url=${sitemapUrl}`);
  }

  return null;
}

async function walk(
  sitemapUrl: string,
  depth: number,
  seen: Set<string>,
  out: SitemapUrl[],
  env: BrightDataEnv,
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (seen.has(sitemapUrl)) return;
  seen.add(sitemapUrl);
  if (out.length >= MAX_URLS) return;

  const xml = await fetchSitemapXml(sitemapUrl, env);
  if (!xml) return;

  const parsed = parseSitemapXml(xml);
  for (const subSitemap of parsed.sitemaps) {
    if (out.length >= MAX_URLS) return;
    await walk(subSitemap, depth + 1, seen, out, env);
  }
  for (const u of parsed.urls) {
    if (out.length >= MAX_URLS) return;
    out.push(u);
  }
}

type ParsedSitemap = { urls: SitemapUrl[]; sitemaps: string[] };

// Parser XML one-pass via htmlparser2 en mode XML. On collecte les <loc>
// dont le parent est <url> (URL feuille) vs <sitemap> (sitemap imbriqué).
export function parseSitemapXml(xml: string): ParsedSitemap {
  const urls: SitemapUrl[] = [];
  const sitemaps: string[] = [];

  const stack: string[] = [];
  let currentText = "";
  let currentLoc = "";
  let currentLastmod = "";

  const parser = new Parser(
    {
      onopentag(name) {
        const tag = name.toLowerCase();
        stack.push(tag);
        if (tag === "url") {
          currentLoc = "";
          currentLastmod = "";
        }
        currentText = "";
      },
      ontext(text) {
        currentText += text;
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        const parent = stack[stack.length - 2];
        const trimmed = currentText.trim();

        if (tag === "loc") {
          if (parent === "url") {
            currentLoc = trimmed;
          } else if (parent === "sitemap") {
            if (trimmed) sitemaps.push(trimmed);
          }
        } else if (tag === "lastmod" && parent === "url") {
          currentLastmod = trimmed;
        } else if (tag === "url") {
          if (currentLoc) {
            urls.push(currentLastmod ? { loc: currentLoc, lastmod: currentLastmod } : { loc: currentLoc });
          }
        }

        stack.pop();
        currentText = "";
      },
    },
    { xmlMode: true, decodeEntities: true },
  );
  parser.write(xml);
  parser.end();

  return { urls, sitemaps };
}
