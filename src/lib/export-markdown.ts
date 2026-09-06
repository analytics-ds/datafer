/**
 * Conversion HTML → Markdown du contenu structuré corpus.
 *
 * L'entrée visée est le `structuredHtml` produit par `extractContent`
 * (src/lib/analysis.ts) : une suite de blocs h1-h6 / p / blockquote / pre /
 * ul-ol-li / table, avec de l'inline (a, strong, em, code, br) à l'intérieur.
 * Même parseur que l'export docx (htmlparser2, streaming) pour ne pas ajouter
 * de dépendance.
 *
 * Sert aux pipelines de rédaction : un contenu concurrent en Markdown se
 * relit, se diffe et s'envoie à un LLM sans traîner le markup.
 *
 * Volontairement minimal et sans échappement agressif : on ne cherche pas un
 * aller-retour HTML → MD → HTML fidèle, on cherche un texte lisible qui
 * conserve la hiérarchie des titres, les listes et les tableaux.
 */

import { Parser } from "htmlparser2";

type ListCtx = { type: "ul" | "ol"; index: number };

/** Échappe le strict minimum : ce qui ferait dérailler la structure MD. */
function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}

/**
 * Sentinelle de saut de ligne dur. On ne peut pas écrire "  \n" directement
 * dans le buffer : la normalisation des espaces en fin de bloc l'écraserait.
 * Ce caractère de contrôle ne survit pas non plus dans un contenu crawlé, il
 * n'y a donc pas de collision possible.
 */
const HARD_BREAK = "\u0001";

export function htmlToMarkdown(html: string): string {
  const out: string[] = [];
  // Buffer du bloc courant. `null` = aucun bloc ouvert. Le préfixe (`## `,
  // `- `, indentation de liste…) est tenu à part : sinon le trim de fin de
  // bloc mangerait l'indentation des listes imbriquées.
  let buf: string | null = null;
  let prefix = "";
  const lists: ListCtx[] = [];
  // Formatage inline courant, pour ne pas rouvrir un ** déjà ouvert.
  let bold = 0;
  let italic = 0;
  let code = 0;
  // Lien en cours : on accumule le libellé puis on écrit [texte](href).
  let linkHref: string | null = null;
  // Table en cours.
  let table: { rows: { cells: string[]; header: boolean }[] } | null = null;
  let row: { cells: string[]; header: boolean } | null = null;
  let cell: string | null = null;
  // `pre` : on préserve les retours à la ligne au lieu de les écraser.
  let inPre = false;

  const flushBlock = () => {
    if (buf === null) return;
    let content: string;
    if (inPre) {
      // Bloc de code : on garde les retours à la ligne tels quels.
      content = buf.replace(/\s+$/, "");
      if (content) out.push(`\`\`\`\n${content}\n\`\`\``);
    } else {
      content = buf
        .replace(/\s+/g, " ")
        .split(HARD_BREAK)
        .map((s) => s.trim())
        .join("  \n")
        .trim();
      if (content) out.push(prefix + content);
    }
    buf = null;
    prefix = "";
  };

  const openBlock = (blockPrefix: string) => {
    flushBlock();
    buf = "";
    prefix = blockPrefix;
  };

  const append = (text: string) => {
    if (cell !== null) {
      cell += text;
      return;
    }
    if (buf === null) buf = "";
    buf += text;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const n = name.toLowerCase();
        switch (n) {
          case "h1":
          case "h2":
          case "h3":
          case "h4":
          case "h5":
          case "h6":
            openBlock(`${"#".repeat(Number(n[1]))} `);
            break;
          case "p":
            openBlock("");
            break;
          case "blockquote":
            openBlock("> ");
            break;
          case "pre":
            flushBlock();
            inPre = true;
            buf = "";
            prefix = "";
            break;
          case "br":
            // Rendu en fin de bloc : deux espaces + \n (saut dur Markdown).
            append(inPre ? "\n" : HARD_BREAK);
            break;
          case "ul":
          case "ol":
            flushBlock();
            lists.push({ type: n, index: 0 });
            break;
          case "li": {
            flushBlock();
            const ctx = lists[lists.length - 1];
            const depth = Math.max(0, lists.length - 1);
            const indent = "  ".repeat(depth);
            if (ctx?.type === "ol") {
              ctx.index += 1;
              openBlock(`${indent}${ctx.index}. `);
            } else {
              openBlock(`${indent}- `);
            }
            break;
          }
          case "strong":
          case "b":
            if (bold === 0) append("**");
            bold += 1;
            break;
          case "em":
          case "i":
            if (italic === 0) append("*");
            italic += 1;
            break;
          case "code":
            if (code === 0 && !inPre) append("`");
            code += 1;
            break;
          case "a":
            linkHref = typeof attribs.href === "string" ? attribs.href : null;
            if (linkHref) append("[");
            break;
          case "table":
            flushBlock();
            table = { rows: [] };
            break;
          case "tr":
            if (table) row = { cells: [], header: false };
            break;
          case "td":
          case "th":
            if (row) {
              cell = "";
              if (n === "th") row.header = true;
            }
            break;
          default:
            break;
        }
      },
      ontext(text) {
        if (!text) return;
        if (inPre) {
          append(text);
          return;
        }
        const normalized = text.replace(/\s+/g, " ");
        if (normalized.trim() === "" && buf === null && cell === null) return;
        append(escapeInline(normalized));
      },
      onclosetag(name) {
        const n = name.toLowerCase();
        switch (n) {
          case "h1":
          case "h2":
          case "h3":
          case "h4":
          case "h5":
          case "h6":
          case "p":
          case "blockquote":
          case "li":
            flushBlock();
            break;
          case "pre":
            flushBlock();
            inPre = false;
            break;
          case "ul":
          case "ol":
            flushBlock();
            lists.pop();
            break;
          case "strong":
          case "b":
            bold = Math.max(0, bold - 1);
            if (bold === 0) append("**");
            break;
          case "em":
          case "i":
            italic = Math.max(0, italic - 1);
            if (italic === 0) append("*");
            break;
          case "code":
            code = Math.max(0, code - 1);
            if (code === 0 && !inPre) append("`");
            break;
          case "a":
            if (linkHref) {
              append(`](${linkHref})`);
              linkHref = null;
            }
            break;
          case "td":
          case "th":
            if (row && cell !== null) {
              row.cells.push(cell.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|"));
              cell = null;
            }
            break;
          case "tr":
            if (table && row) {
              table.rows.push(row);
              row = null;
            }
            break;
          case "table":
            if (table) {
              const md = renderTable(table.rows);
              if (md) out.push(md);
              table = null;
            }
            break;
          default:
            break;
        }
      },
    },
    { decodeEntities: true },
  );

  parser.write(html || "");
  parser.end();
  flushBlock();

  // Un bloc par entrée, séparés par une ligne vide : c'est ce que tout
  // renderer Markdown attend, et ça reste lisible brut dans un terminal.
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Table Markdown (GFM). La première ligne sert d'en-tête. */
function renderTable(rows: { cells: string[]; header: boolean }[]): string {
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.cells.length));
  if (width === 0) return "";
  const pad = (cells: string[]) => {
    const c = [...cells];
    while (c.length < width) c.push("");
    return c;
  };
  const [first, ...rest] = rows;
  const lines = [
    `| ${pad(first.cells).join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rest.map((r) => `| ${pad(r.cells).join(" | ")} |`),
  ];
  return lines.join("\n");
}
