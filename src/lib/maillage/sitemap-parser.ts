import { Parser } from "htmlparser2";
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
//
// Ne lit pas <lastmod> pour la décision de fraîcheur : c'est volontaire,
// on s'appuie sur HEAD + hash de contenu côté sync (cf. sync.ts).
export async function fetchAndParseSitemap(rootUrl: string): Promise<SitemapUrl[]> {
  const seen = new Set<string>();
  const out: SitemapUrl[] = [];
  await walk(rootUrl, 0, seen, out);
  return out;
}

async function walk(
  sitemapUrl: string,
  depth: number,
  seen: Set<string>,
  out: SitemapUrl[],
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (seen.has(sitemapUrl)) return;
  seen.add(sitemapUrl);
  if (out.length >= MAX_URLS) return;

  let xml: string;
  try {
    const res = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "application/xml, text/xml, */*;q=0.5",
        "User-Agent": "DataferSitemapBot/1.0 (+https://datafer.analytics-e0d.workers.dev)",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(`[maillage] sitemap fetch fail ${res.status} url=${sitemapUrl}`);
      return;
    }
    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_SITEMAP_BYTES) {
      console.log(`[maillage] sitemap too large bytes=${contentLength} url=${sitemapUrl}`);
      return;
    }
    xml = await res.text();
    if (xml.length > MAX_SITEMAP_BYTES) {
      console.log(`[maillage] sitemap too large after read bytes=${xml.length} url=${sitemapUrl}`);
      return;
    }
  } catch (e) {
    console.log(`[maillage] sitemap fetch error url=${sitemapUrl} err=${(e as Error).message}`);
    return;
  }

  const parsed = parseSitemapXml(xml);
  for (const subSitemap of parsed.sitemaps) {
    if (out.length >= MAX_URLS) return;
    await walk(subSitemap, depth + 1, seen, out);
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
