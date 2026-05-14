import { describe, it, expect } from "vitest";
import { extractParagraphsFromHtml } from "@/lib/analysis";

describe("extractParagraphsFromHtml", () => {
  it("retourne un tableau vide quand il n'y a pas de paragraphe", () => {
    expect(extractParagraphsFromHtml("<h1>Titre</h1><div>texte</div>")).toEqual(
      [],
    );
  });

  it("ignore les paragraphes sous le seuil de mots", () => {
    expect(extractParagraphsFromHtml("<p>Beaucoup trop court.</p>")).toEqual([]);
  });

  it("garde les paragraphes au-dessus du seuil par défaut (40 mots)", () => {
    const longPara = Array.from({ length: 45 }, (_, i) => `mot${i}`).join(" ");
    const result = extractParagraphsFromHtml(`<p>${longPara}</p>`);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(longPara);
  });

  it("respecte un seuil minWords personnalisé", () => {
    const html = "<p>un deux trois</p>";
    expect(extractParagraphsFromHtml(html, 2)).toEqual(["un deux trois"]);
    expect(extractParagraphsFromHtml(html, 5)).toEqual([]);
  });

  it("strip les balises internes et normalise les espaces", () => {
    const html =
      "<p>Texte avec   <strong>du gras</strong>\n et   des espaces multiples ici présents oui</p>";
    const result = extractParagraphsFromHtml(html, 3);
    expect(result[0]).toBe(
      "Texte avec du gras et des espaces multiples ici présents oui",
    );
  });

  it("extrait plusieurs paragraphes en ne gardant que les assez longs", () => {
    const longPara = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const html = `<p>court</p><p>${longPara}</p><p>aussi court</p>`;
    const result = extractParagraphsFromHtml(html);
    expect(result).toEqual([longPara]);
  });
});
