/**
 * Génération d'un vrai .docx (Office Open XML) à partir du contenu rédigé.
 *
 * On parse le HTML (htmlparser2 = streaming, ~30kB), on accumule des
 * paragraphes/runs Word, puis on zippe le tout (fflate, ~10kB). Le résultat
 * est un Uint8Array qu'on sert avec le bon Content-Type.
 *
 * Volontairement minimal : pas d'images, pas de styles personnalisés.
 * Couvre h1/h2/h3/p, gras/italique/souligné, listes à puces et numérotées,
 * tableaux. Ce qu'on a dans l'éditeur datafer.
 */

import { Parser } from "htmlparser2";
import { zipSync, strToU8 } from "fflate";

type RunFmt = { bold?: boolean; italic?: boolean; underline?: boolean };
type Run = { text: string; fmt: RunFmt };

type ParaKind = "p" | "h1" | "h2" | "h3" | "li-bullet" | "li-number";

type Para = { kind: ParaKind; runs: Run[] };

type Cell = { paras: Para[] };
type Row = { cells: Cell[] };
type Table = { kind: "table"; rows: Row[] };

type Block = Para | Table;

export function renderDocx(keyword: string, html: string): Uint8Array {
  const blocks = parseHtmlToBlocks(html || "<p></p>");
  const documentXml = buildDocumentXml(blocks, keyword);

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(CONTENT_TYPES_XML),
    "_rels/.rels": strToU8(ROOT_RELS_XML),
    "word/document.xml": strToU8(documentXml),
    "word/_rels/document.xml.rels": strToU8(DOC_RELS_XML),
    "word/styles.xml": strToU8(STYLES_XML),
    "word/numbering.xml": strToU8(NUMBERING_XML),
  };
  return zipSync(files);
}

// ─── HTML → blocks ──────────────────────────────────────────────────────────

function parseHtmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];

  // Stack pour suivre la balise courante (formatage, kind de paragraphe).
  const fmtStack: RunFmt[] = [{}];
  // null = on n'est pas dans un paragraphe ; sinon, le buffer en cours.
  let currentPara: Para | null = null;
  // Listes imbriquées : on garde le dernier `ul`/`ol` rencontré.
  const listStack: ("ul" | "ol")[] = [];
  // État table en cours.
  let currentTable: Table | null = null;
  let currentRow: Row | null = null;
  let currentCell: Cell | null = null;

  const currentFmt = () => ({ ...fmtStack[fmtStack.length - 1] });

  const startPara = (kind: ParaKind) => {
    flushPara();
    currentPara = { kind, runs: [] };
  };

  const flushPara = () => {
    if (!currentPara) return;
    if (currentCell) currentCell.paras.push(currentPara);
    else blocks.push(currentPara);
    currentPara = null;
  };

  const appendText = (text: string) => {
    if (!text) return;
    // Pas de paragraphe ouvert : on en démarre un implicite.
    if (!currentPara) {
      currentPara = { kind: "p", runs: [] };
    }
    currentPara.runs.push({ text, fmt: currentFmt() });
  };

  const parser = new Parser(
    {
      onopentag(name) {
        const n = name.toLowerCase();
        switch (n) {
          case "h1":
          case "h2":
          case "h3":
            startPara(n as ParaKind);
            break;
          case "p":
            startPara("p");
            break;
          case "br":
            // soft break : ajoute un \n dans le run courant
            appendText("\n");
            break;
          case "ul":
            listStack.push("ul");
            break;
          case "ol":
            listStack.push("ol");
            break;
          case "li": {
            const top = listStack[listStack.length - 1] ?? "ul";
            startPara(top === "ol" ? "li-number" : "li-bullet");
            break;
          }
          case "strong":
          case "b":
            fmtStack.push({ ...currentFmt(), bold: true });
            break;
          case "em":
          case "i":
            fmtStack.push({ ...currentFmt(), italic: true });
            break;
          case "u":
            fmtStack.push({ ...currentFmt(), underline: true });
            break;
          case "table":
            flushPara();
            currentTable = { kind: "table", rows: [] };
            break;
          case "tr":
            if (currentTable) currentRow = { cells: [] };
            break;
          case "td":
          case "th":
            if (currentRow) {
              currentCell = { paras: [] };
              // Force un para H1 implicite ? Non, on laisse au texte de
              // créer un para `p` automatiquement quand il arrivera.
              currentPara = { kind: "p", runs: [] };
              if (n === "th") fmtStack.push({ ...currentFmt(), bold: true });
            }
            break;
          default:
            // ignore unknown tags
            break;
        }
      },
      ontext(text) {
        if (!text) return;
        // Normalise les whitespaces autour des line breaks HTML.
        const normalized = text.replace(/\s+/g, " ");
        if (normalized.trim() === "" && !currentPara) return; // évite paragraphes vides au top-level
        appendText(normalized);
      },
      onclosetag(name) {
        const n = name.toLowerCase();
        switch (n) {
          case "h1":
          case "h2":
          case "h3":
          case "p":
          case "li":
            flushPara();
            break;
          case "ul":
          case "ol":
            listStack.pop();
            break;
          case "strong":
          case "b":
          case "em":
          case "i":
          case "u":
            fmtStack.pop();
            break;
          case "table":
            if (currentTable) {
              if (currentCell) currentCell = null;
              if (currentRow) currentRow = null;
              blocks.push(currentTable);
              currentTable = null;
            }
            break;
          case "tr":
            if (currentTable && currentRow) {
              currentTable.rows.push(currentRow);
              currentRow = null;
            }
            break;
          case "td":
          case "th":
            flushPara();
            if (currentRow && currentCell) {
              currentRow.cells.push(currentCell);
              currentCell = null;
            }
            if (n === "th") fmtStack.pop();
            break;
          default:
            break;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  flushPara();

  return blocks;
}

// ─── Blocks → document.xml ──────────────────────────────────────────────────

function buildDocumentXml(blocks: Block[], _title: string): string {
  const body = blocks.map(renderBlock).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
}

function renderBlock(block: Block): string {
  if ("kind" in block && block.kind === "table") {
    return renderTable(block);
  }
  return renderPara(block as Para);
}

function renderPara(p: Para): string {
  const styleId = paraStyleId(p.kind);
  const numPr = listNumPr(p.kind);
  const pPr = `<w:pPr>${styleId ? `<w:pStyle w:val="${styleId}"/>` : ""}${numPr}</w:pPr>`;
  const runs = p.runs.map(renderRun).join("");
  return `<w:p>${pPr}${runs}</w:p>`;
}

function paraStyleId(kind: ParaKind): string | null {
  switch (kind) {
    case "h1":
      return "Heading1";
    case "h2":
      return "Heading2";
    case "h3":
      return "Heading3";
    default:
      return null;
  }
}

function listNumPr(kind: ParaKind): string {
  if (kind === "li-bullet") return `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`;
  if (kind === "li-number") return `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>`;
  return "";
}

function renderRun(run: Run): string {
  // Gère les line breaks dans le texte : on coupe sur \n et on insère <w:br/>.
  const parts = run.text.split("\n");
  const inner = parts
    .map((part, idx) => {
      const escaped = escapeXml(part);
      const t = `<w:t xml:space="preserve">${escaped}</w:t>`;
      return idx === 0 ? t : `<w:br/>${t}`;
    })
    .join("");
  const rPr = renderRunFmt(run.fmt);
  return `<w:r>${rPr}${inner}</w:r>`;
}

function renderRunFmt(fmt: RunFmt): string {
  if (!fmt.bold && !fmt.italic && !fmt.underline) return "";
  let s = "<w:rPr>";
  if (fmt.bold) s += "<w:b/>";
  if (fmt.italic) s += "<w:i/>";
  if (fmt.underline) s += '<w:u w:val="single"/>';
  s += "</w:rPr>";
  return s;
}

function renderTable(t: Table): string {
  const rows = t.rows.map(renderRow).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/></w:tblBorders></w:tblPr>${rows}</w:tbl><w:p/>`;
}

function renderRow(r: Row): string {
  const cells = r.cells.map(renderCell).join("");
  return `<w:tr>${cells}</w:tr>`;
}

function renderCell(c: Cell): string {
  const paras = (c.paras.length === 0 ? [{ kind: "p" as const, runs: [] }] : c.paras)
    .map(renderPara)
    .join("");
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paras}</w:tc>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Constantes XML ─────────────────────────────────────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="480" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
