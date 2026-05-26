// Moteur de suggestions de maillage interne.
//
// Entrée : HTML de l'éditeur de brief + clientId. Sortie : top N suggestions
// {url cible, ancre, paragraphIndex où insérer, score}.
//
// Garanties (par construction) :
//  - Aucune suggestion sur un titre (h1/h2/h3/h4/h5/h6). On ne lit que <p>.
//  - Aucune suggestion vers une URL déjà présente dans l'éditeur.
//  - Aucune suggestion sur un paragraphe qui contient déjà un lien.
//  - Une seule suggestion par paragraphe (le top score), pour ne pas
//    proposer 3 liens dans le même <p>.

import { Parser } from "htmlparser2";
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { clientUrlIndex } from "@/db/schema";
import type * as schema from "@/db/schema";
import { cosineSimilarityF32, decodeEmbedding, embedTexts } from "./url-embedder";
import type { MaillageSuggestion } from "./types";

const MIN_PARAGRAPH_WORDS = 30;
const MIN_COSINE_SCORE = 0.55;
const MAX_SUGGESTIONS_DEFAULT = 5;
const ANCHOR_MIN_WORDS = 2;
const ANCHOR_MAX_WORDS = 5;

type DB = DrizzleD1Database<typeof schema>;

type EditorParagraph = {
  index: number;
  text: string;
  wordCount: number;
};

type EditorExtraction = {
  paragraphs: EditorParagraph[];
  linkedHrefs: Set<string>;
};

// Extrait les <p> "purs" (qui ne contiennent pas déjà un <a>), tokenise par
// index, et liste tous les hrefs déjà présents dans l'éditeur (pour
// dédoublonnage).
export function extractEditableParagraphs(html: string): EditorExtraction {
  const paragraphs: EditorParagraph[] = [];
  const linkedHrefs = new Set<string>();
  let pIndex = -1;
  let inP = false;
  let pHasLink = false;
  let pBuf = "";
  let depthInsideP = 0;

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const tag = name.toLowerCase();
        if (tag === "a" && attrs.href) {
          linkedHrefs.add(normalizeHrefForCompare(attrs.href));
          if (inP) pHasLink = true;
        }
        if (tag === "p") {
          // Pas de <p> imbriqués en HTML valide, mais on track quand même
          if (inP) depthInsideP++;
          else {
            inP = true;
            pHasLink = false;
            pBuf = "";
            pIndex++;
          }
        }
      },
      ontext(text) {
        if (inP) pBuf += text;
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (tag === "p") {
          if (depthInsideP > 0) {
            depthInsideP--;
            return;
          }
          if (inP) {
            inP = false;
            const cleaned = pBuf.replace(/\s+/g, " ").trim();
            const wc = cleaned ? cleaned.split(/\s+/).length : 0;
            if (!pHasLink && wc >= MIN_PARAGRAPH_WORDS) {
              paragraphs.push({ index: pIndex, text: cleaned, wordCount: wc });
            }
            pBuf = "";
            pHasLink = false;
          }
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();

  return { paragraphs, linkedHrefs };
}

function normalizeHrefForCompare(href: string): string {
  try {
    const u = new URL(href, "https://example.com");
    return u.href.replace(/#.*$/, "").replace(/\/$/, "");
  } catch {
    return href.toLowerCase().trim().replace(/#.*$/, "").replace(/\/$/, "");
  }
}

export type SuggestParams = {
  clientId: string;
  editorHtml: string;
  maxSuggestions?: number;
};

export async function suggestInternalLinks(
  db: DB,
  ai: Ai | undefined,
  params: SuggestParams,
): Promise<{ suggestions: MaillageSuggestion[]; reason: "ok" | "no_paragraphs" | "no_index" | "no_ai" }> {
  if (!ai) {
    return { suggestions: [], reason: "no_ai" };
  }

  const { paragraphs, linkedHrefs } = extractEditableParagraphs(params.editorHtml);
  if (paragraphs.length === 0) {
    return { suggestions: [], reason: "no_paragraphs" };
  }

  // Charge l'index URL du client, seulement les actives avec un embedding
  const rows = await db
    .select()
    .from(clientUrlIndex)
    .where(and(eq(clientUrlIndex.clientId, params.clientId), eq(clientUrlIndex.isActive, true)))
    .all();

  type IndexedUrl = {
    url: string;
    title: string | null;
    h1: string | null;
    embedding: Float32Array;
  };
  const indexed: IndexedUrl[] = [];
  for (const r of rows) {
    const emb = decodeEmbedding(r.embedding as ArrayBuffer | Uint8Array | null);
    if (!emb) continue;
    const normalizedHref = normalizeHrefForCompare(r.url);
    if (linkedHrefs.has(normalizedHref)) continue;
    indexed.push({ url: r.url, title: r.title, h1: r.h1, embedding: emb });
  }
  if (indexed.length === 0) {
    return { suggestions: [], reason: "no_index" };
  }

  // Embed les paragraphes en un seul appel batch
  const paraEmbeddings = await embedTexts(
    ai,
    paragraphs.map((p) => p.text),
  );

  type Candidate = {
    paragraph: EditorParagraph;
    url: IndexedUrl;
    score: number;
  };
  const candidates: Candidate[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const pEmb = paraEmbeddings[i];
    if (!pEmb) continue;
    for (const u of indexed) {
      const s = cosineSimilarityF32(pEmb, u.embedding);
      if (s >= MIN_COSINE_SCORE) {
        candidates.push({ paragraph: paragraphs[i], url: u, score: s });
      }
    }
  }

  // Tri par score décroissant, puis on retient une seule suggestion par
  // paragraphe et une seule suggestion par URL cible (évite la redondance).
  candidates.sort((a, b) => b.score - a.score);
  const usedParagraphs = new Set<number>();
  const usedUrls = new Set<string>();
  const maxN = params.maxSuggestions ?? MAX_SUGGESTIONS_DEFAULT;
  const out: MaillageSuggestion[] = [];

  for (const c of candidates) {
    if (out.length >= maxN) break;
    if (usedParagraphs.has(c.paragraph.index)) continue;
    if (usedUrls.has(c.url.url)) continue;
    const anchor = chooseAnchor(c.paragraph.text, c.url.title || c.url.h1 || "");
    if (!anchor) continue;
    out.push({
      url: c.url.url,
      title: c.url.title,
      anchor,
      paragraphIndex: c.paragraph.index,
      paragraphPreview: c.paragraph.text.slice(0, 80),
      score: Number(c.score.toFixed(3)),
    });
    usedParagraphs.add(c.paragraph.index);
    usedUrls.add(c.url.url);
  }

  return { suggestions: out, reason: "ok" };
}

// Sélectionne une ancre dans le paragraphe :
// 1. Si le paragraphe contient une sous-séquence de 2 à 5 mots qui apparaît
//    aussi (telle quelle) dans le title de l'URL cible : utilise celle-là.
// 2. Sinon, cherche un segment de 3 à 4 mots du paragraphe contenant au
//    moins un token significatif du title.
// 3. Sinon, retourne null (pas de suggestion crédible).
//
// Ne retourne JAMAIS le title brut comme ancre : l'ancre doit toujours
// venir du paragraphe pour rester naturelle dans le flux.
export function chooseAnchor(paragraph: string, targetTitle: string): string | null {
  const pTokens = tokenize(paragraph);
  if (pTokens.length === 0) return null;
  const titleTokens = new Set(tokenize(targetTitle).filter((t) => !STOPWORDS.has(t.toLowerCase())));
  if (titleTokens.size === 0) {
    return null;
  }
  const lowerTokens = pTokens.map((t) => t.toLowerCase());

  // Cherche le meilleur segment scoré sur l'overlap avec titleTokens
  let bestStart = -1;
  let bestLen = 0;
  let bestScore = 0;
  for (let len = ANCHOR_MAX_WORDS; len >= ANCHOR_MIN_WORDS; len--) {
    for (let i = 0; i + len <= pTokens.length; i++) {
      let overlap = 0;
      for (let k = 0; k < len; k++) {
        if (titleTokens.has(lowerTokens[i + k])) overlap++;
      }
      if (overlap === 0) continue;
      const score = overlap * 10 + (len === 3 ? 2 : 0); // léger biais vers 3 mots
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
        bestLen = len;
      }
    }
    if (bestScore > 0 && len <= 3) break;
  }
  if (bestStart === -1) return null;
  return pTokens.slice(bestStart, bestStart + bestLen).join(" ");
}

function tokenize(s: string): string[] {
  return s.match(/[\p{L}\p{N}'-]+/gu) || [];
}

// Stopwords FR + EN minimaux pour éviter qu'un "le" matche entre le titre
// et le paragraphe. On ne cherche pas l'exhaustivité, juste à virer le bruit.
const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "l",
  "et", "ou", "mais", "donc", "or", "ni", "car",
  "à", "au", "aux", "en", "dans", "pour", "par", "sur", "avec", "sans",
  "que", "qui", "quoi", "dont", "où",
  "ce", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
  "the", "a", "an", "of", "to", "in", "for", "on", "with",
  "and", "or", "but", "is", "are", "was", "were",
  "il", "elle", "on", "ils", "elles", "nous", "vous", "je", "tu",
  "n", "ne", "pas", "plus", "moins",
  "est", "sont", "ont", "été",
]);
