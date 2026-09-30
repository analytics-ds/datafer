/**
 * Lecture côté serveur du HTML de l'éditeur, à l'identique de ce que lit
 * l'éditeur dans le navigateur (brief-editor.tsx) : même texte (innerText),
 * mêmes titres, mêmes signaux GEO, même saillance du mot-clé, mêmes
 * paragraphes pour le critère sémantique.
 *
 * Pourquoi (2026-09-30) : l'API (`POST /api/v1/briefs/{id}/content`, `GET
 * /api/v2/briefs/{id}/scoring`) scorait avec des regex sur le HTML brut. Le
 * texte n'avait pas les mêmes sauts de bloc que l'innerText du navigateur (un
 * saut après chaque titre et chaque puce, là où le navigateur n'en met qu'un),
 * ce qui changeait le critère structure, et ni la sémantique ni la saillance
 * n'étaient calculées. Un même contenu n'avait donc pas le même score selon
 * qu'il passait par l'API ou par l'éditeur.
 *
 * Validé contre Chrome sur des briefs réels (scripts/compare-editor-html.ts).
 */
import { parseDocument } from "htmlparser2";
import type { AnyNode, Element, Text } from "domhandler";
import { buildKeywordRegex, normalize, type EditorData } from "@/lib/scoring";
import type { GeoSignals } from "@/lib/geo-scoring";

type Root = ReturnType<typeof parseDocument>;

const isEl = (n: AnyNode): n is Element => n.type === "tag" || n.type === "script" || n.type === "style";
const isText = (n: AnyNode): n is Text => n.type === "text";
const tagOf = (n: Element) => n.name.toLowerCase();

function textContent(n: AnyNode): string {
  if (isText(n)) return n.data;
  if (isEl(n) || n.type === "root") {
    let s = "";
    for (const c of (n as Element).children) s += textContent(c);
    return s;
  }
  return "";
}

/** Tous les éléments descendants, dans l'ordre du document (= querySelectorAll). */
function descendants(n: AnyNode, out: Element[] = []): Element[] {
  const children = (n as Element).children ?? [];
  for (const c of children) {
    if (isEl(c)) {
      out.push(c);
      descendants(c, out);
    }
  }
  return out;
}

function hasAncestor(el: Element, test: (a: Element) => boolean, root: AnyNode): boolean {
  let p = el.parent;
  while (p && p !== root) {
    if (isEl(p as AnyNode) && test(p as Element)) return true;
    p = p.parent;
  }
  return false;
}

// ─── innerText ──────────────────────────────────────────────────────────────
// Algorithme de la spec HTML (« rendered text collection steps ») avec les
// styles par défaut du navigateur, qui sont ceux de l'éditeur : un bloc
// demande 1 saut de ligne avant et après, un <p> en demande 2, <br> donne un
// saut, les cellules d'un tableau sont séparées par une tabulation. Les blancs
// sont repliés comme en `white-space: normal`.

const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "center", "details", "dialog", "dd", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hgroup", "hr", "li", "main", "menu", "nav", "ol", "p", "pre", "section", "summary", "table", "ul",
  "caption", "legend",
]);
const HIDDEN = new Set(["script", "style", "head", "template", "noscript", "title", "meta", "link"]);

type Item = string | number; // texte, ou nombre de sauts de ligne requis
type Ctx = { transform: string; hidden: boolean };

// Styles en ligne qui changent l'innerText : le HTML collé depuis un site en
// porte souvent (un <div style="display:inline-block"> ne fait pas de saut de
// ligne, un text-transform:uppercase passe en capitales dans l'innerText).
function inlineStyle(el: Element, prop: string): string | null {
  const style = el.attribs?.style;
  if (!style) return null;
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;!]+)`, "i");
  const m = style.match(re);
  return m ? m[1].trim().toLowerCase() : null;
}

function applyTransform(s: string, t: string): string {
  if (t === "uppercase") return s.toUpperCase();
  if (t === "lowercase") return s.toLowerCase();
  if (t === "capitalize") return s.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  return s;
}

function collect(n: AnyNode, items: Item[], ws: { pendingSpace: boolean; lineStart: boolean }, ctx: Ctx) {
  if (isText(n)) {
    if (ctx.hidden) return;
    const collapsed = applyTransform(n.data.replace(/[ \t\n\r\f]+/g, " "), ctx.transform);
    for (const ch of collapsed.split(/( )/)) {
      if (ch === "") continue;
      if (ch === " ") {
        ws.pendingSpace = true;
        continue;
      }
      if (ws.pendingSpace && !ws.lineStart) items.push(" ");
      ws.pendingSpace = false;
      ws.lineStart = false;
      items.push(ch);
    }
    return;
  }
  if (!isEl(n)) return;
  const tag = tagOf(n);
  if (HIDDEN.has(tag)) return;
  const display = inlineStyle(n, "display");
  if (display === "none" || n.attribs?.hidden !== undefined) return;
  const visibility = inlineStyle(n, "visibility");
  const childCtx: Ctx = {
    transform: inlineStyle(n, "text-transform") ?? ctx.transform,
    hidden: visibility ? visibility !== "visible" : ctx.hidden,
  };
  if (tag === "br") {
    items.push("\n");
    ws.pendingSpace = false;
    ws.lineStart = true;
    return;
  }
  const lineBreak = () => {
    ws.pendingSpace = false;
    ws.lineStart = true;
  };
  const isCell = display ? display === "table-cell" : tag === "td" || tag === "th";
  const isRow = display ? display === "table-row" : tag === "tr";
  const block = display
    ? ["block", "flex", "grid", "list-item", "table", "flow-root", "table-caption"].includes(display)
    : BLOCK.has(tag);

  if (isCell) {
    // Tabulation entre deux cellules d'une même ligne (pas avant la première).
    const prevCell = (() => {
      let s = n.prev;
      while (s) {
        if (isEl(s as AnyNode) && ["td", "th"].includes(tagOf(s as Element))) return true;
        s = s.prev;
      }
      return false;
    })();
    if (prevCell) items.push("\t");
    lineBreak();
  }
  if (isRow && !isFirstRow(n)) {
    // Chrome sépare les lignes d'un tableau par un saut littéral, qui s'ajoute
    // aux sauts demandés par un bloc de la cellule précédente (« B » dans un
    // <div> en fin de ligne donne « B\n\nC »), et n'en met pas après la
    // dernière ligne. Vérifié contre Chrome le 2026-09-30.
    items.push("\n");
    lineBreak();
  }
  if (block) {
    items.push(tag === "p" ? 2 : 1);
    lineBreak();
  }
  for (const c of n.children) collect(c, items, ws, childCtx);
  if (block) {
    items.push(tag === "p" ? 2 : 1);
    lineBreak();
  }
  if (isCell) lineBreak();
}

function isFirstRow(tr: Element): boolean {
  let table: AnyNode | null = tr.parent;
  while (table && !(isEl(table) && tagOf(table as Element) === "table")) table = table.parent;
  if (!table) return true;
  const firstRow = descendants(table).find((d) => tagOf(d) === "tr");
  return firstRow === tr;
}

export function innerText(root: AnyNode): string {
  const items: Item[] = [];
  const ws = { pendingSpace: false, lineStart: true };
  for (const c of (root as Element).children) collect(c, items, ws, { transform: "none", hidden: false });
  // Retire les sauts requis en tête et en queue, puis remplace chaque suite de
  // sauts requis par le maximum de la suite.
  while (items.length && typeof items[0] === "number") items.shift();
  while (items.length && typeof items[items.length - 1] === "number") items.pop();
  let out = "";
  let run = 0;
  for (const it of items) {
    if (typeof it === "number") {
      run = Math.max(run, it);
      continue;
    }
    if (run) {
      out += "\n".repeat(run);
      run = 0;
    }
    out += it;
  }
  return out;
}

// ─── Lecture complète ───────────────────────────────────────────────────────

export type EditorReading = {
  editorData: EditorData;
  geoSignals: GeoSignals;
  /** Textes des paragraphes à scorer en sémantique, dédoublonnés comme l'éditeur. */
  semanticParagraphs: string[];
};

/** Même clé de cache que l'éditeur : deux paragraphes de même clé comptent une fois. */
export function paragraphCacheKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

const SUMMARY_KEYWORDS = ["résumé", "resume", "tldr", "tl;dr", "tl ; dr", "en bref", "synthèse", "synthese", "à retenir", "a retenir",
  "key takeaways", "takeaways", "summary", "in short", "at a glance", "in a nutshell"];
const NUMERIC_RE = /\b\d+(?:[.,]\d+)?\s*(?:%|€|\$|km|kg|cm|mm|m²|m2|ans?|jours?|paires?|fois|mots?|heures?|minutes?)(?![a-zA-Zé])/gi;

/** Port de extractGeoSignals (geo-scoring.ts) sur l'arbre htmlparser2. */
function geoSignals(root: Root, all: Element[]): GeoSignals {
  const hasTable = all.some((el) => tagOf(el) === "table" && descendants(el).some((d) => tagOf(d) === "td"));
  const bulletItemsCount = all.filter(
    (el) => tagOf(el) === "li" && hasAncestor(el, (a) => ["ul", "ol"].includes(tagOf(a)), root),
  ).length;

  let hasQuickSummary = false;
  const earlyBlocks = root.children.filter(isEl).slice(0, 3);
  for (const block of earlyBlocks) {
    if (
      tagOf(block) === "p" &&
      descendants(block).some((d) => ["em", "i"].includes(tagOf(d))) &&
      textContent(block).trim().length > 30
    ) {
      hasQuickSummary = true;
      break;
    }
  }
  const headings = all.filter((el) => ["h2", "h3"].includes(tagOf(el)));
  if (!hasQuickSummary) {
    hasQuickSummary = headings.some((h) => {
      const t = textContent(h).toLowerCase();
      return SUMMARY_KEYWORDS.some((k) => t.includes(k));
    });
  }

  let questionHeadings = 0;
  let faqSectionFound = false;
  for (const h of headings) {
    const txt = textContent(h).trim();
    if (txt.endsWith("?") || txt.endsWith(" ?")) questionHeadings++;
    if (tagOf(h) === "h2" && /\bfaq\b|questions/i.test(txt)) faqSectionFound = true;
  }
  const faqQuestionsCount = faqSectionFound && questionHeadings < 2 ? 2 : questionHeadings;

  const numericMentionsCount = (textContent(root).match(NUMERIC_RE) ?? []).length;
  return { hasTable, bulletItemsCount, hasQuickSummary, faqQuestionsCount, numericMentionsCount };
}

/** Port de detectKwEmphasized (brief-editor.tsx) : KW exact en gras à sa 1re mention hors titres. */
function kwEmphasized(root: Root, keyword: string): boolean | undefined {
  if (!keyword) return undefined;
  const segs: { node: Text; start: number; end: number }[] = [];
  let full = "";
  const walk = (n: AnyNode) => {
    if (isEl(n) && /^h[1-6]$/.test(tagOf(n))) return; // FILTER_REJECT : sous-arbre ignoré
    if (isText(n)) {
      const norm = normalize(n.data);
      segs.push({ node: n, start: full.length, end: full.length + norm.length });
      full += norm;
      return;
    }
    for (const c of (n as Element).children ?? []) walk(c);
  };
  for (const c of root.children) walk(c);
  if (!full.trim()) return undefined;
  const re = buildKeywordRegex(keyword);
  re.lastIndex = 0;
  const m = re.exec(full);
  if (!m) return false;
  const seg = segs.find((s) => m.index >= s.start && m.index < s.end);
  if (!seg) return false;
  let p = seg.node.parent;
  while (p && (p as AnyNode) !== root) {
    if (isEl(p as AnyNode) && /^(strong|b|em|i)$/.test(tagOf(p as Element))) return true;
    p = p.parent;
  }
  return false;
}

export function readEditorHtml(html: string, keyword: string): EditorReading {
  const root = parseDocument(html);
  const all = descendants(root);
  const heads = (tag: string) =>
    all.filter((el) => tagOf(el) === tag).map((el) => textContent(el).trim()).filter(Boolean);

  const editorData: EditorData = {
    text: innerText(root),
    h1s: heads("h1"),
    h2s: heads("h2"),
    h3s: heads("h3"),
    imageCount: all.filter((el) => tagOf(el) === "img").length,
    kwEmphasized: kwEmphasized(root, keyword),
  };

  const seen = new Set<string>();
  const semanticParagraphs: string[] = [];
  for (const el of all) {
    if (!["p", "ul", "ol"].includes(tagOf(el))) continue;
    const t = textContent(el).trim();
    if (t.split(/\s+/).filter(Boolean).length < 5) continue;
    const key = paragraphCacheKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    semanticParagraphs.push(t);
  }

  return { editorData, geoSignals: geoSignals(root, all), semanticParagraphs };
}
