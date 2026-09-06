/**
 * Exposition du contenu crawlé des concurrents dans l'API V2.
 *
 * Deux champs sont persistés par concurrent dans `serpJson` (cf.
 * briefs-service.ts) : `text` (texte brut) et `structuredHtml` (HTML
 * reconstitué, H1/H2/H3/P/listes/tables dans l'ordre du document). Le
 * Markdown, lui, est dérivé à la volée du `structuredHtml` : le stocker
 * ferait grossir la row D1 pour rien.
 *
 * Rappel du cap de persistance : 30 000 caractères par champ et par
 * concurrent, appliqué à la création du brief pour ne pas faire sauter la
 * limite de taille de row D1. Un contenu à la limite est donc peut-être
 * tronqué, d'où le drapeau `truncated` renvoyé au client.
 */

import type { SerpResult } from "@/lib/analysis";
import { htmlToMarkdown } from "@/lib/export-markdown";

/** Doit rester aligné sur MAX_TEXT_CHARS / MAX_STRUCTURED_HTML_CHARS. */
export const CONTENT_CAP_CHARS = 30_000;

export const CONTENT_MODES = ["none", "text", "html", "markdown", "all"] as const;
export type ContentMode = (typeof CONTENT_MODES)[number];

export function parseContentMode(raw: string | null): ContentMode | null {
  if (raw === null || raw === "") return "none";
  // Alias pratiques en ligne de commande.
  const v = raw.toLowerCase();
  if (v === "md") return "markdown";
  if (v === "structuredhtml") return "html";
  if (v === "1" || v === "true") return "all";
  return (CONTENT_MODES as readonly string[]).includes(v) ? (v as ContentMode) : null;
}

export const FORMATS = ["text", "html", "markdown"] as const;
export type ContentFormat = (typeof FORMATS)[number];

export function parseFormat(raw: string | null): ContentFormat | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "md") return "markdown";
  if (v === "txt") return "text";
  return (FORMATS as readonly string[]).includes(v) ? (v as ContentFormat) : null;
}

export type CompetitorContent = {
  hasContent: boolean;
  chars: number;
  /** Le contenu persisté a atteint le cap : il est probablement coupé. */
  truncated: boolean;
  text?: string | null;
  structuredHtml?: string | null;
  markdown?: string | null;
};

/**
 * Champs de contenu à joindre à un concurrent selon le mode demandé.
 * En mode "none", on ne renvoie que les métadonnées (présence + taille) :
 * c'est ce qui permet de décider d'un second appel sans payer le payload.
 */
export function competitorContent(c: SerpResult, mode: ContentMode): CompetitorContent {
  const text = c.text ?? null;
  const html = c.structuredHtml ?? null;
  const chars = text?.length ?? 0;
  const meta: CompetitorContent = {
    hasContent: typeof text === "string" && text.length > 0,
    chars,
    truncated: chars >= CONTENT_CAP_CHARS || (html?.length ?? 0) >= CONTENT_CAP_CHARS,
  };

  if (mode === "none") return meta;
  if (mode === "text" || mode === "all") meta.text = text;
  if (mode === "html" || mode === "all") meta.structuredHtml = html;
  if (mode === "markdown" || mode === "all") {
    meta.markdown = html ? htmlToMarkdown(html) : null;
  }
  return meta;
}

/** Rendu d'un concurrent dans un seul format, pour les réponses non-JSON. */
export function renderCompetitorAs(c: SerpResult, format: ContentFormat): string | null {
  if (format === "text") return c.text ?? null;
  if (format === "html") return c.structuredHtml ?? null;
  return c.structuredHtml ? htmlToMarkdown(c.structuredHtml) : null;
}
