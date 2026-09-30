import { describe, it, expect } from "vitest";
import { parseDocument } from "htmlparser2";
import { innerText, readEditorHtml } from "@/lib/editor-html";

// Sorties relevées dans Chrome (element.innerText d'un contentEditable) le
// 2026-09-30. Le score serveur doit lire le texte exactement comme l'éditeur.
const CHROME: [string, string][] = [
  [`<table><tr><td>A</td><td><div>B</div></td></tr><tr><td>C</td><td>D</td></tr></table>`, "A\t\nB\n\nC\tD"],
  [`<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>`, "A\tB\nC\tD"],
  [`<table><tr><td><div>A</div></td><td>B</td></tr><tr><td>C</td></tr></table>`, "A\n\tB\nC"],
  [`<table><tr><td>A</td><td><p>B</p></td></tr><tr><td>C</td></tr></table><p>E</p>`, "A\t\n\nB\n\n\nC\n\nE"],
  [`<p>X</p><table><tr><th>A</th><th>B</th></tr><tr><td>C</td><td>D</td></tr></table><h2>T</h2>`, "X\n\nA\tB\nC\tD\nT"],
  [`<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><div>B</div><div>B2</div></td></tr><tr><td>C</td></tr></tbody></table>`, "A\n\nB\nB2\n\nC"],
  [`<ul><li><p>A</p></li><li>B</li></ul><p>C</p>`, "A\n\nB\n\nC"],
  [`<div>A</div><div><div>B</div></div>C<br>D<br><br>E`, "A\nB\nC\nD\n\nE"],
];

describe("innerText (aligné sur Chrome)", () => {
  it.each(CHROME)("%s", (html, expected) => {
    expect(innerText(parseDocument(html))).toBe(expected);
  });

  it("titres et puces : un seul saut, comme le navigateur", () => {
    expect(innerText(parseDocument("<h2>A</h2><h3>B</h3><ul><li>c</li><li>d</li></ul>"))).toBe("A\nB\nc\nd");
  });

  it("styles en ligne : inline-block sans saut, text-transform appliqué", () => {
    const html = `<p>x</p><div style="display: inline-block; text-transform: uppercase;">Recommandé</div> fin`;
    expect(innerText(parseDocument(html))).toBe("x\n\nRECOMMANDÉ fin");
  });
});

describe("readEditorHtml", () => {
  it("saillance : KW en gras à sa première mention hors titres", () => {
    const html = `<h1>Pull fin femme</h1><p>Le <strong>pull fin femme</strong> est léger.</p>`;
    expect(readEditorHtml(html, "pull fin femme").editorData.kwEmphasized).toBe(true);
    const plain = `<h1>Pull fin femme</h1><p>Le pull fin femme est léger.</p>`;
    expect(readEditorHtml(plain, "pull fin femme").editorData.kwEmphasized).toBe(false);
  });

  it("paragraphes sémantiques : p, ul, ol de 5 mots et plus, dédoublonnés", () => {
    const html = `<p>un deux trois quatre cinq</p><p>un deux trois quatre cinq</p><p>trop court</p><ul><li>a b c</li><li>d e f</li></ul>`;
    expect(readEditorHtml(html, "").semanticParagraphs).toEqual(["un deux trois quatre cinq", "a b cd e f"]);
  });
});
