import { describe, it, expect } from "vitest";
import {
  extractParagraphsFromHtml,
  filterPaaByLanguage,
  findDomainHit,
  extractJsonPayloadText,
  parseGoogleSerpHtml,
  parseHTML,
  resolveGoogleRedirect,
  runNLP,
} from "@/lib/analysis";

describe("runNLP face aux mots qui collident avec Object.prototype", () => {
  // Régression du 14/09/2026 : un titre de concurrent contenant « constructor »
  // faisait planter toute l'analyse (« Cannot read properties of undefined »)
  // et le brief tombait en failed. Même piège avec toString, valueOf,
  // hasOwnProperty et __proto__, sur les titres comme sur le corps de texte.
  const piegeux = [
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "__proto__",
  ];

  function page(n: number) {
    return {
      text: `Le ${piegeux.join(" ")} des capuches de pluie pour femme, un texte de test suffisamment long pour alimenter le calcul des termes et des entites nommees sur la page numero ${n}.`,
      h1: [`Capuche de pluie femme ${n}`],
      h2: piegeux.map((m) => `Section ${m} numero ${n}`),
      h3: [`Detail ${piegeux[n % piegeux.length]}`],
      outline: [],
      headings: 6,
      paragraphs: 3,
      wordCount: 320,
      imageCount: 2,
      structuredHtml: `<h1>Capuche ${n}</h1><p>${piegeux.join(" ")}</p>`,
    };
  }

  it("ne plante pas et produit un resultat exploitable", () => {
    const pages = [0, 1, 2, 3, 4].map(page);
    const res = runNLP(pages, "capuche de pluie femme");
    expect(res).toBeTruthy();
    expect(Array.isArray(res.nlpTerms)).toBe(true);
  });

  it("plante pas non plus quand le mot piegeux est le seul contenu des titres", () => {
    const pages = [0, 1, 2].map((n) => ({
      ...page(n),
      h2: ["constructor"],
      h3: ["toString"],
    }));
    expect(() => runNLP(pages, "capuche de pluie femme")).not.toThrow();
  });
});

describe("resolveGoogleRedirect", () => {
  it("laisse passer une URL qui n'est pas une redirection Google", async () => {
    const url = "https://www.amv.fr/assurance-moto";
    await expect(resolveGoogleRedirect(url)).resolves.toBe(url);
  });

  it("décode /url?q= sans appel réseau", async () => {
    await expect(
      resolveGoogleRedirect(
        "https://www.google.fr/url?q=https://www.macif.fr/moto&sa=U",
      ),
    ).resolves.toBe("https://www.macif.fr/moto");
  });

  it("rend l'entrée telle quelle si elle n'est pas une URL valide", async () => {
    await expect(resolveGoogleRedirect("pas-une-url")).resolves.toBe(
      "pas-une-url",
    );
  });
});

describe("parseGoogleSerpHtml", () => {
  const serp = `
    <div><a href="https://www.google.fr/preferences"><h3>Paramètres</h3></a></div>
    <div class="g"><a href="https://www.amv.fr/assurance-moto"><br><h3 class="LC20lb">Assurance moto AMV</h3></a>
      <div>Devis en ligne</div></div>
    <div class="g"><a href="https://www.macif.fr/assurance-moto"><h3>Assurance moto &amp; scooter</h3></a></div>
    <div class="g"><a href="https://www.amv.fr/assurance-moto"><h3>Doublon AMV</h3></a></div>
  `;

  it("extrait les résultats organiques dans l'ordre de la SERP", () => {
    const r = parseGoogleSerpHtml(serp);
    expect(r.map((x) => x.link)).toEqual([
      "https://www.amv.fr/assurance-moto",
      "https://www.macif.fr/assurance-moto",
    ]);
    expect(r[0].position).toBe(1);
    expect(r[0].title).toBe("Assurance moto AMV");
    expect(r[0].displayed_link).toBe("www.amv.fr");
  });

  it("décode les entités HTML des titres", () => {
    expect(parseGoogleSerpHtml(serp)[1].title).toBe("Assurance moto & scooter");
  });

  it("garde les propriétés Google qui sont de vrais résultats organiques", () => {
    // developers.google.com sort en position 1 sur « qu'est-ce que le SEO ».
    const html = `
      <div><a href="https://www.google.fr/search?q=seo"><h3>Recherches associées</h3></a></div>
      <div><a href="https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=fr"><h3>Guide SEO de Google</h3></a></div>
      <div><a href="https://support.google.com/webmasters/answer/7451184"><h3>Aide Search Console</h3></a></div>
    `;
    const r = parseGoogleSerpHtml(html);
    expect(r.map((x) => x.displayed_link)).toEqual([
      "developers.google.com",
      "support.google.com",
    ]);
  });

  it("écarte les liens internes Google et les doublons d'URL", () => {
    const links = parseGoogleSerpHtml(serp).map((x) => x.link);
    expect(links.some((l) => l.includes("google.fr"))).toBe(false);
    expect(new Set(links).size).toBe(links.length);
  });

  it("renvoie un tableau vide sur un HTML sans résultat", () => {
    expect(
      parseGoogleSerpHtml("<html><body>pas de SERP</body></html>"),
    ).toEqual([]);
  });
});

describe("extractParagraphsFromHtml", () => {
  it("retourne un tableau vide quand il n'y a pas de paragraphe", () => {
    expect(extractParagraphsFromHtml("<h1>Titre</h1><div>texte</div>")).toEqual(
      [],
    );
  });

  it("ignore les paragraphes sous le seuil de mots", () => {
    expect(extractParagraphsFromHtml("<p>Beaucoup trop court.</p>")).toEqual(
      [],
    );
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

describe("extractJsonPayloadText", () => {
  it("retourne une chaîne vide sans payload JSON", () => {
    expect(extractJsonPayloadText("<div><p>texte normal</p></div>")).toBe("");
  });

  it("extrait la prose d'un script application/json", () => {
    const prose =
      "Ceci est un vrai paragraphe de contenu editorial suffisamment long.";
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      { props: { pageProps: { description: prose } } },
    )}</script>`;
    expect(extractJsonPayloadText(html)).toContain(prose);
  });

  it("ignore les URLs et le contenu non-textuel, garde la prose", () => {
    const html = `<script type="application/json">${JSON.stringify({
      url: "https://example.com/very/long/path/to/a/page/here",
      numbers: "1234567890 1234567890 1234567890 9876543210",
      prose:
        "Ceci est une vraie phrase de contenu suffisamment longue pour passer le filtre.",
    })}</script>`;
    const out = extractJsonPayloadText(html);
    expect(out).toContain("vraie phrase de contenu");
    expect(out).not.toContain("example.com");
    expect(out).not.toContain("9876543210");
  });

  it("strip le HTML inline des champs richtext", () => {
    const html = `<script type="application/json">${JSON.stringify({
      body: "<p>Du <strong>contenu</strong> riche avec assez de mots ici presents.</p>",
    })}</script>`;
    const out = extractJsonPayloadText(html);
    expect(out).toContain("Du contenu riche avec assez de mots ici presents.");
    expect(out).not.toContain("<strong>");
  });

  it("déduplique les chaînes identiques", () => {
    const prose = "Une phrase repetee plusieurs fois dans le payload JSON ici.";
    const html = `<script type="application/json">${JSON.stringify({
      a: prose,
      b: prose,
      c: { d: prose },
    })}</script>`;
    const out = extractJsonPayloadText(html);
    expect(out.split(prose).length - 1).toBe(1);
  });

  it("ignore un bloc JSON invalide sans crasher", () => {
    const html = `<script type="application/json">{ ceci n'est pas du JSON</script>`;
    expect(extractJsonPayloadText(html)).toBe("");
  });
});

describe("parseHTML — contenu dans un <form>", () => {
  it("capture le contenu éditorial wrappé dans un <form> (pattern ASP.NET)", () => {
    const html =
      "<form runat=server>" +
      "<h1>Titre principal de la page</h1>" +
      "<p>Voici un paragraphe de contenu editorial reel qui doit etre capture malgre le form englobant.</p>" +
      "<input type=text name=q>" +
      "<button>Envoyer</button>" +
      "</form>";
    const parsed = parseHTML(html);
    expect(parsed.wordCount).toBeGreaterThan(10);
    expect(parsed.h1).toContain("Titre principal de la page");
    expect(parsed.text).toContain("contenu editorial reel");
  });

  it("continue d'ignorer le texte des boutons même dans un form", () => {
    const html =
      "<form>" +
      "<p>Contenu editorial visible et assez long pour le scoring NLP.</p>" +
      "<button>Texte de bouton a ignorer absolument</button>" +
      "</form>";
    const parsed = parseHTML(html);
    expect(parsed.text).toContain("Contenu editorial visible");
    expect(parsed.text).not.toContain("Texte de bouton");
  });
});

describe("parseHTML — titres dans les <button> (accordéons FAQ)", () => {
  it("capture un H2 dans le bouton d'un accordéon (pattern Shopify/Freeman)", () => {
    const html =
      '<div class="accordion">' +
      '<button class="accordion__header" type="button">' +
      '<span class="accordion__title title-h5">' +
      '<h2 class="text-l-med">Comment porter un jean large ?</h2>' +
      "</span>" +
      '<span class="accordion__icon">+</span>' +
      "</button>" +
      '<div class="accordion__content">' +
      "<p>Avec des baskets ou des talons, le jean large se porte taille haute pour allonger la silhouette.</p>" +
      "<h3>Quelles chaussures choisir ?</h3>" +
      "<p>Des chaussures plates conviennent parfaitement au quotidien pour un style décontracté.</p>" +
      "</div>" +
      "</div>";
    const parsed = parseHTML(html);
    expect(parsed.h2).toContain("Comment porter un jean large ?");
    expect(parsed.h3).toContain("Quelles chaussures choisir ?");
    // L'icône UI du bouton ne doit pas polluer le texte ni le titre.
    expect(parsed.text).not.toContain("+");
    expect(parsed.outline.map((o) => o.text)).toContain(
      "Comment porter un jean large ?",
    );
  });

  it("continue d'ignorer le texte non-titre des boutons", () => {
    const html =
      "<p>Paragraphe editorial suffisamment long pour etre conserve par le parseur.</p>" +
      "<button>Ajouter au panier maintenant</button>";
    const parsed = parseHTML(html);
    expect(parsed.text).not.toContain("Ajouter au panier");
  });

  it("garde le balisage inline d'un titre dans un bouton", () => {
    const html =
      "<button><h2>Question avec <strong>gras</strong> dedans ?</h2></button>";
    const parsed = parseHTML(html);
    expect(parsed.h2).toContain("Question avec gras dedans ?");
  });
});

describe("filterPaaByLanguage", () => {
  const q = (question: string) => ({ question, snippet: "", link: "" });

  it("retire les questions anglaises sur une SERP FR", () => {
    const paa = [
      q("Comment choisir un brasero ?"),
      q("What is the best fire pit?"),
      q("Quel est le meilleur brasero ?"),
      q("How to light a fire pit"),
    ];
    expect(filterPaaByLanguage(paa, "fr").map((p) => p.question)).toEqual([
      "Comment choisir un brasero ?",
      "Quel est le meilleur brasero ?",
    ]);
  });

  it("ne filtre rien sur une SERP EN", () => {
    const paa = [q("What is the best fire pit?"), q("How to light a fire pit")];
    expect(filterPaaByLanguage(paa, "us")).toHaveLength(2);
    expect(filterPaaByLanguage(paa, "uk")).toHaveLength(2);
  });

  it("garde une question FR commençant par un mot non interrogatif", () => {
    const paa = [
      q("Brasero ou barbecue : que choisir ?"),
      q("Doit-on couvrir un brasero ?"),
    ];
    expect(filterPaaByLanguage(paa, "fr")).toHaveLength(2);
  });

  it("ne matche pas un mot FR qui contient un interrogatif EN en préfixe", () => {
    // "Où" ne commence pas par un mot EN ; "Whisky" commence par "Whi" mais
    // pas par un mot entier de la liste (limite \b).
    const paa = [q("Où acheter un brasero ?"), q("Whisky tourbé ou fruité ?")];
    expect(filterPaaByLanguage(paa, "fr")).toHaveLength(2);
  });
});

describe("findDomainHit", () => {
  const serp = [
    {
      position: 1,
      title: "",
      link: "https://www.amazon.fr/brasero",
      snippet: "",
      displayed_link: "",
    },
    {
      position: 2,
      title: "",
      link: "https://blog.coeo.fr/guide-brasero",
      snippet: "",
      displayed_link: "",
    },
    {
      position: 3,
      title: "",
      link: "https://coeo.fr/braseros",
      snippet: "",
      displayed_link: "",
    },
  ];

  it("retourne position ET url de la 1re occurrence du domaine", () => {
    expect(findDomainHit(serp, "https://coeo.fr")).toEqual({
      position: 2,
      url: "https://blog.coeo.fr/guide-brasero",
    });
  });

  it("matche en ignorant www et le protocole", () => {
    expect(findDomainHit(serp, "www.amazon.fr")?.url).toBe(
      "https://www.amazon.fr/brasero",
    );
  });

  it("retourne null si le domaine est absent ou non fourni", () => {
    expect(findDomainHit(serp, "https://celio.com")).toBeNull();
    expect(findDomainHit(serp, null)).toBeNull();
  });
});
