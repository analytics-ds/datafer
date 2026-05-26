import { describe, it, expect } from "vitest";
import { extractEditableParagraphs, chooseAnchor } from "../suggest";

describe("extractEditableParagraphs", () => {
  it("returns only <p> tags, never headings", () => {
    const html = `
      <h1>Heading 1 avec beaucoup de mots dedans pour faire un test long et passer le seuil minimum du moteur de suggestions de maillage interne datafer ne doit jamais sortir comme paragraphe</h1>
      <h2>Heading 2 pareil avec beaucoup de mots pour faire un test long passer le seuil minimum du moteur de suggestions de maillage interne datafer ne doit jamais ressortir comme paragraphe non plus</h2>
      <p>Voici un vrai paragraphe avec assez de mots significatifs pour etre retenu comme paragraphe editable dans le moteur de suggestions interne pour le maillage interne du brief par les consultants datafer qui rédigent</p>
    `;
    const r = extractEditableParagraphs(html);
    expect(r.paragraphs.length).toBe(1);
    expect(r.paragraphs[0].text).toContain("vrai paragraphe");
  });

  it("skips short paragraphs (< 30 words)", () => {
    const html = `<p>Trop court.</p>`;
    const r = extractEditableParagraphs(html);
    expect(r.paragraphs).toEqual([]);
  });

  it("skips paragraphs that already contain a link", () => {
    const html = `
      <p>Voici un paragraphe avec un <a href="https://exemple.com">lien interne</a> au milieu et beaucoup de mots autour pour bien passer le seuil minimum de comptage du moteur de suggestion de maillage interne au sein de l'editeur datafer pour les consultants</p>
      <p>Voici un autre paragraphe sans aucun lien et avec encore plus de mots pour passer le seuil minimum du moteur de suggestion de maillage interne propre au sein de l'editeur datafer pour les consultants qui rédigent leur brief</p>
    `;
    const r = extractEditableParagraphs(html);
    expect(r.paragraphs.length).toBe(1);
    expect(r.paragraphs[0].text).toContain("autre paragraphe sans aucun lien");
  });

  it("collects all existing hrefs in the editor", () => {
    const html = `<p>texte <a href="https://a.com/page">lien</a></p><p>plus de texte <a href="https://b.com">autre</a></p>`;
    const r = extractEditableParagraphs(html);
    expect(r.linkedHrefs.has("https://a.com/page")).toBe(true);
    expect(r.linkedHrefs.has("https://b.com")).toBe(true);
  });

  it("assigns paragraphIndex that maps to actual <p> DOM order", () => {
    const html = `
      <p>Premier paragraphe avec suffisamment de mots pour etre retenu dans le moteur de suggestions interne datafer afin de tester l'indexation correcte ainsi que la stabilité de la numérotation des paragraphes</p>
      <h2>Heading qui ne compte pas</h2>
      <p>Second paragraphe avec suffisamment de mots pour etre retenu dans le moteur de suggestions interne datafer afin de tester l'indexation correcte ainsi que la stabilité de la numérotation des paragraphes</p>
    `;
    const r = extractEditableParagraphs(html);
    expect(r.paragraphs.length).toBe(2);
    expect(r.paragraphs[0].index).toBe(0);
    expect(r.paragraphs[1].index).toBe(1);
  });
});

describe("chooseAnchor", () => {
  it("picks a 2-5 word sub-sequence containing tokens from the title", () => {
    const para = "Pour bien gérer ses lunettes de soleil, il faut d'abord choisir une bonne paire adaptée à la forme du visage.";
    const title = "Comment choisir ses lunettes de soleil";
    const anchor = chooseAnchor(para, title);
    expect(anchor).not.toBeNull();
    expect(anchor!.toLowerCase()).toContain("lunettes");
  });

  it("returns null when no overlap with title tokens", () => {
    const para = "Un texte completement deconnecte du sujet sans aucun rapport.";
    const title = "Astronomie galaxies trous noirs";
    expect(chooseAnchor(para, title)).toBeNull();
  });

  it("returns null when title is all stopwords", () => {
    const para = "Voici un texte normal.";
    const title = "le la les du de";
    expect(chooseAnchor(para, title)).toBeNull();
  });
});
