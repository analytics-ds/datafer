import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "@/lib/export-markdown";
import {
  competitorContent,
  parseContentMode,
  parseFormat,
  renderCompetitorAs,
  CONTENT_CAP_CHARS,
} from "@/lib/competitor-content";
import type { SerpResult } from "@/lib/analysis";

describe("htmlToMarkdown", () => {
  it("convertit les titres selon leur niveau", () => {
    expect(htmlToMarkdown("<h1>Titre</h1><h2>Sous-titre</h2><h3>Détail</h3>")).toBe(
      "# Titre\n\n## Sous-titre\n\n### Détail",
    );
  });

  it("sépare les paragraphes par une ligne vide", () => {
    expect(htmlToMarkdown("<p>Un</p><p>Deux</p>")).toBe("Un\n\nDeux");
  });

  it("normalise les espaces et les retours à la ligne du HTML", () => {
    expect(htmlToMarkdown("<p>  trop\n   d'espaces  </p>")).toBe("trop d'espaces");
  });

  it("rend les listes à puces et numérotées", () => {
    expect(htmlToMarkdown("<ul><li>a</li><li>b</li></ul>")).toBe("- a\n\n- b");
    expect(htmlToMarkdown("<ol><li>un</li><li>deux</li></ol>")).toBe("1. un\n\n2. deux");
  });

  it("indente les listes imbriquées", () => {
    const md = htmlToMarkdown("<ul><li>parent</li><ul><li>enfant</li></ul></ul>");
    expect(md).toContain("- parent");
    expect(md).toContain("  - enfant");
  });

  it("rend le gras, l'italique et le code inline", () => {
    expect(htmlToMarkdown("<p>du <strong>gras</strong> et de l'<em>italique</em></p>")).toBe(
      "du **gras** et de l'*italique*",
    );
    expect(htmlToMarkdown("<p>appelle <code>fetch</code></p>")).toBe("appelle `fetch`");
  });

  it("rend les liens avec leur href", () => {
    expect(htmlToMarkdown('<p>voir <a href="https://x.fr/a">la page</a></p>')).toBe(
      "voir [la page](https://x.fr/a)",
    );
  });

  it("ignore un lien sans href mais garde son libellé", () => {
    expect(htmlToMarkdown("<p>voir <a>la page</a></p>")).toBe("voir la page");
  });

  it("rend une citation en blockquote", () => {
    expect(htmlToMarkdown("<blockquote>cité</blockquote>")).toBe("> cité");
  });

  it("préserve les retours à la ligne dans un pre", () => {
    expect(htmlToMarkdown("<pre>ligne1\nligne2</pre>")).toBe("```\nligne1\nligne2\n```");
  });

  it("rend une table en pipe table GFM avec ligne de séparation", () => {
    const html =
      "<table><tr><th>Modèle</th><th>Prix</th></tr><tr><td>A</td><td>100 €</td></tr></table>";
    expect(htmlToMarkdown(html)).toBe(
      "| Modèle | Prix |\n| --- | --- |\n| A | 100 € |",
    );
  });

  it("complète les lignes de table trop courtes", () => {
    const html = "<table><tr><th>A</th><th>B</th></tr><tr><td>seule</td></tr></table>";
    expect(htmlToMarkdown(html)).toBe("| A | B |\n| --- | --- |\n| seule |  |");
  });

  it("échappe les pipes dans une cellule", () => {
    const html = "<table><tr><td>a|b</td></tr></table>";
    expect(htmlToMarkdown(html)).toContain("a\\|b");
  });

  it("échappe les caractères qui casseraient la structure Markdown", () => {
    expect(htmlToMarkdown("<p>2 * 3 et _underscore_ et [crochet]</p>")).toBe(
      "2 \\* 3 et \\_underscore\\_ et \\[crochet\\]",
    );
  });

  it("transforme un br en retour à la ligne dur", () => {
    expect(htmlToMarkdown("<p>a<br>b</p>")).toBe("a  \nb");
  });

  it("décode les entités HTML", () => {
    expect(htmlToMarkdown("<p>caf&eacute; &amp; th&eacute;</p>")).toBe("café & thé");
  });

  it("ignore les balises inconnues sans perdre le texte", () => {
    expect(htmlToMarkdown("<section><p>gardé</p></section>")).toBe("gardé");
  });

  it("renvoie une chaîne vide sur une entrée vide", () => {
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("<p></p>")).toBe("");
  });

  it("conserve l'ordre du document sur un contenu réaliste", () => {
    const html = [
      "<h1>Chaussures running</h1>",
      "<p>Intro.</p>",
      "<h2>Amorti</h2>",
      "<p>Le <strong>drop</strong> compte.</p>",
      "<ul><li>Route</li><li>Trail</li></ul>",
    ].join("\n");
    expect(htmlToMarkdown(html)).toBe(
      "# Chaussures running\n\nIntro.\n\n## Amorti\n\nLe **drop** compte.\n\n- Route\n\n- Trail",
    );
  });
});

describe("parseContentMode", () => {
  it("vaut none quand le param est absent", () => {
    expect(parseContentMode(null)).toBe("none");
    expect(parseContentMode("")).toBe("none");
  });

  it("accepte les modes et leurs alias", () => {
    expect(parseContentMode("text")).toBe("text");
    expect(parseContentMode("HTML")).toBe("html");
    expect(parseContentMode("md")).toBe("markdown");
    expect(parseContentMode("structuredHtml")).toBe("html");
    expect(parseContentMode("1")).toBe("all");
    expect(parseContentMode("true")).toBe("all");
  });

  it("rejette un mode inconnu", () => {
    expect(parseContentMode("pdf")).toBeNull();
  });
});

describe("parseFormat", () => {
  it("accepte les formats et leurs alias", () => {
    expect(parseFormat("text")).toBe("text");
    expect(parseFormat("txt")).toBe("text");
    expect(parseFormat("md")).toBe("markdown");
    expect(parseFormat("markdown")).toBe("markdown");
    expect(parseFormat("html")).toBe("html");
  });

  it("rejette un format inconnu ou vide", () => {
    expect(parseFormat("docx")).toBeNull();
    expect(parseFormat(null)).toBeNull();
  });
});

function competitor(over: Partial<SerpResult> = {}): SerpResult {
  return {
    position: 1,
    title: "Titre",
    link: "https://x.fr/a",
    displayed_link: "x.fr",
    snippet: "snip",
    text: "Titre Contenu",
    structuredHtml: "<h1>Titre</h1><p>Contenu</p>",
    ...over,
  } as SerpResult;
}

describe("competitorContent", () => {
  it("en mode none, ne renvoie que les métadonnées", () => {
    const c = competitorContent(competitor(), "none");
    expect(c).toEqual({ hasContent: true, chars: 13, truncated: false });
  });

  it("joint le champ demandé et lui seul", () => {
    expect(competitorContent(competitor(), "text").text).toBe("Titre Contenu");
    expect(competitorContent(competitor(), "text").structuredHtml).toBeUndefined();
    expect(competitorContent(competitor(), "html").structuredHtml).toContain("<h1>");
    expect(competitorContent(competitor(), "markdown").markdown).toBe("# Titre\n\nContenu");
  });

  it("en mode all, joint les trois formats", () => {
    const c = competitorContent(competitor(), "all");
    expect(c.text).toBe("Titre Contenu");
    expect(c.structuredHtml).toContain("<h1>");
    expect(c.markdown).toBe("# Titre\n\nContenu");
  });

  it("signale l'absence de contenu sur un brief antérieur à la persistance", () => {
    const c = competitorContent(
      competitor({ text: undefined, structuredHtml: undefined }),
      "all",
    );
    expect(c.hasContent).toBe(false);
    expect(c.chars).toBe(0);
    expect(c.text).toBeNull();
    expect(c.markdown).toBeNull();
  });

  it("lève truncated quand le contenu atteint le cap de persistance", () => {
    const c = competitorContent(competitor({ text: "x".repeat(CONTENT_CAP_CHARS) }), "none");
    expect(c.truncated).toBe(true);
  });
});

describe("renderCompetitorAs", () => {
  it("rend le format demandé", () => {
    expect(renderCompetitorAs(competitor(), "text")).toBe("Titre Contenu");
    expect(renderCompetitorAs(competitor(), "html")).toContain("<p>Contenu</p>");
    expect(renderCompetitorAs(competitor(), "markdown")).toBe("# Titre\n\nContenu");
  });

  it("renvoie null quand le contenu n'a pas été persisté", () => {
    const bare = competitor({ text: undefined, structuredHtml: undefined });
    expect(renderCompetitorAs(bare, "text")).toBeNull();
    expect(renderCompetitorAs(bare, "markdown")).toBeNull();
  });
});
