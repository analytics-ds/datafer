import { Parser } from "htmlparser2";
import { brightDataFetch, looksLikeChallengePage, type BrightDataEnv } from "./brightdata-fetch";
import type { CrawledUrlContent } from "./types";

const FETCH_TIMEOUT_MS = 12000;
const HEAD_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 2_000_000;
const FIRST_PARAGRAPH_MAX_WORDS = 200;
const FIRST_PARAGRAPH_MIN_WORDS = 15;
const USER_AGENT = "DataferSitemapBot/1.0 (+https://datafer.analytics-e0d.workers.dev)";

// Pipeline à 2 niveaux :
// 1. Fetch direct (gratuit, ~70% des sites passent).
// 2. Bright Data Web Unlocker en fallback (~$1.50/CPM) pour les sites
//    protégés type Celio/Datadome qui répondent 403 ou avec un challenge JS.
//
// Quand on passe par BD, les headers HTTP du serveur d'origine (ETag,
// Last-Modified) ne sont pas exposés, on stocke null. La détection de
// changement repose alors uniquement sur le hash de contenu.
export async function crawlUrlForIndex(
  url: string,
  env: BrightDataEnv = {},
): Promise<CrawledUrlContent | null> {
  // 1. Fetch direct
  const direct = await tryFetchDirect(url);
  if (direct && !looksLikeChallengePage(direct.html)) {
    return await buildContent(url, direct.html, direct.etag, direct.lastMod);
  }

  // 2. Fallback Bright Data
  if (env.BRIGHTDATA_TOKEN && env.BRIGHTDATA_ZONE) {
    const html = await brightDataFetch(url, env, { timeoutMs: 30000 });
    if (html && !looksLikeChallengePage(html)) {
      console.log(`[maillage] crawl via BD ok url=${url} bytes=${html.length}`);
      return await buildContent(url, html, null, null);
    }
    console.log(`[maillage] crawl BD KO url=${url}`);
  }

  return null;
}

async function tryFetchDirect(
  url: string,
): Promise<{ html: string; etag: string | null; lastMod: string | null } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(`[maillage] crawl direct http=${res.status} url=${url}`);
      return null;
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("xml")) {
      console.log(`[maillage] crawl direct non-html ct=${ct} url=${url}`);
      return null;
    }
    const etag = res.headers.get("etag");
    const lastMod = res.headers.get("last-modified");
    const text = await res.text();
    const html = text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
    return { html, etag, lastMod };
  } catch (e) {
    console.log(`[maillage] crawl direct error url=${url} err=${(e as Error).message}`);
    return null;
  }
}

async function buildContent(
  url: string,
  html: string,
  etag: string | null,
  lastMod: string | null,
): Promise<CrawledUrlContent> {
  const extracted = extractMetadata(html);
  const contentHash = await sha256(
    [extracted.title || "", extracted.h1 || "", extracted.metaDescription || "", extracted.firstParagraph || ""].join("|"),
  );
  return {
    url,
    title: extracted.title,
    h1: extracted.h1,
    metaDescription: extracted.metaDescription,
    firstParagraph: extracted.firstParagraph,
    etag,
    lastModifiedHeader: lastMod,
    contentHash,
  };
}

// HEAD request léger pour vérifier si l'URL a changé sans télécharger le body.
// Retourne {etag, lastModified, status, changed} où changed est true si on
// devrait re-crawler (headers manquants ou différents des valeurs stockées).
export async function headCheck(
  url: string,
  prev: { etag?: string | null; lastModifiedHeader?: string | null },
): Promise<{ etag: string | null; lastModified: string | null; status: number; changed: boolean }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    const etag = res.headers.get("etag");
    const lastMod = res.headers.get("last-modified");
    if (!res.ok) return { etag, lastModified: lastMod, status: res.status, changed: true };
    const sameEtag = etag && prev.etag && etag === prev.etag;
    const sameLastMod = lastMod && prev.lastModifiedHeader && lastMod === prev.lastModifiedHeader;
    const haveAnyHeader = !!etag || !!lastMod;
    // Si aucun header pertinent : on considère "changed" pour forcer un GET
    // (et c'est le hash de contenu qui décidera ensuite si on re-embed).
    const changed = !haveAnyHeader || !(sameEtag || sameLastMod);
    return { etag, lastModified: lastMod, status: res.status, changed };
  } catch {
    return { etag: null, lastModified: null, status: 0, changed: true };
  }
}

type ExtractedMeta = {
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  firstParagraph: string | null;
};

// Extraction one-pass via htmlparser2 : title, premier h1, meta description,
// premier paragraphe significatif (>= 15 mots, plafonné à 200 mots).
export function extractMetadata(html: string): ExtractedMeta {
  let inTitle = false;
  let inH1 = false;
  let inP = false;
  let inSkipped = false;
  let skipDepth = 0;
  let title: string | null = null;
  let h1: string | null = null;
  let metaDescription: string | null = null;
  let firstParagraph: string | null = null;
  let pBuf = "";
  let titleBuf = "";
  let h1Buf = "";

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const tag = name.toLowerCase();
        if (inSkipped) {
          if (tag === "script" || tag === "style" || tag === "nav" || tag === "footer" || tag === "header" || tag === "aside") {
            skipDepth++;
          }
          return;
        }
        if (tag === "script" || tag === "style" || tag === "nav" || tag === "footer" || tag === "header" || tag === "aside") {
          inSkipped = true;
          skipDepth = 1;
          return;
        }
        if (tag === "title" && title === null) inTitle = true;
        else if (tag === "h1" && h1 === null) inH1 = true;
        else if (tag === "p" && firstParagraph === null) {
          inP = true;
          pBuf = "";
        }
        else if (tag === "meta" && metaDescription === null) {
          const n = (attrs.name || attrs.property || "").toLowerCase();
          if (n === "description" || n === "og:description") {
            const content = attrs.content || "";
            if (content.trim()) metaDescription = normalizeWhitespace(content);
          }
        }
      },
      ontext(text) {
        if (inSkipped) return;
        if (inTitle) titleBuf += text;
        else if (inH1) h1Buf += text;
        else if (inP) pBuf += text;
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (inSkipped) {
          if (tag === "script" || tag === "style" || tag === "nav" || tag === "footer" || tag === "header" || tag === "aside") {
            skipDepth--;
            if (skipDepth <= 0) inSkipped = false;
          }
          return;
        }
        if (tag === "title" && inTitle) {
          inTitle = false;
          title = normalizeWhitespace(titleBuf);
        } else if (tag === "h1" && inH1) {
          inH1 = false;
          h1 = normalizeWhitespace(h1Buf);
        } else if (tag === "p" && inP) {
          inP = false;
          const cleaned = normalizeWhitespace(pBuf);
          const wc = countWords(cleaned);
          if (wc >= FIRST_PARAGRAPH_MIN_WORDS && firstParagraph === null) {
            firstParagraph = capWords(cleaned, FIRST_PARAGRAPH_MAX_WORDS);
          }
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();

  return { title, h1, metaDescription, firstParagraph };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function capWords(s: string, maxWords: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return s;
  return words.slice(0, maxWords).join(" ");
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    hex += (v < 16 ? "0" : "") + v.toString(16);
  }
  return hex;
}
