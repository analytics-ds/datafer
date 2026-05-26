import { describe, it, expect } from "vitest";
import { extractMetadata } from "../url-crawler";

describe("extractMetadata", () => {
  it("extracts title, h1, meta description and first significant paragraph", () => {
    const html = `<!DOCTYPE html>
      <html>
        <head>
          <title>Titre de la page</title>
          <meta name="description" content="Une description de la page">
        </head>
        <body>
          <h1>Heading principal</h1>
          <p>Court.</p>
          <p>Ceci est un paragraphe avec assez de mots significatifs pour être retenu comme premier paragraphe de la page parce qu'il dépasse le seuil minimum.</p>
          <p>Un autre paragraphe.</p>
        </body>
      </html>`;
    const m = extractMetadata(html);
    expect(m.title).toBe("Titre de la page");
    expect(m.h1).toBe("Heading principal");
    expect(m.metaDescription).toBe("Une description de la page");
    expect(m.firstParagraph).toContain("paragraphe avec assez de mots");
    // Le court paragraphe ("Court.") ne doit pas être retenu
    expect(m.firstParagraph).not.toContain("Court.");
  });

  it("ignores nav/footer/script content for first paragraph", () => {
    const html = `<html><body>
      <nav><p>navigation de plus de quinze mots qui ne doit absolument pas être prise comme premier paragraphe contenu réel</p></nav>
      <footer><p>footer pareil avec plus de quinze mots qui ne doit pas être pris comme premier paragraphe non plus du tout</p></footer>
      <main><p>Voici le vrai contenu principal de la page avec suffisamment de mots pour passer le seuil minimum de quinze.</p></main>
    </body></html>`;
    const m = extractMetadata(html);
    expect(m.firstParagraph).toContain("vrai contenu principal");
  });

  it("falls back to og:description if name=description absent", () => {
    const html = `<html><head>
      <meta property="og:description" content="Open Graph description">
    </head><body></body></html>`;
    const m = extractMetadata(html);
    expect(m.metaDescription).toBe("Open Graph description");
  });

  it("returns nulls when nothing extractable", () => {
    const m = extractMetadata("<html><body><div>juste un div</div></body></html>");
    expect(m.title).toBeNull();
    expect(m.h1).toBeNull();
    expect(m.metaDescription).toBeNull();
    expect(m.firstParagraph).toBeNull();
  });
});
