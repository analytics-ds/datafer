/**
 * Test local de la pipeline NLP avec des PageContent simulés.
 * Valide le tokenizer (n-grammes avec stopwords sémantiques) et
 * computeKeywordTerms (sous-parties du keyword).
 *
 * Lancement : npx tsx scripts/test-nlp.ts
 */
import { runNLP, type PageContent } from "../src/lib/analysis";

function makePage(text: string, h1: string[] = [], h2: string[] = []): PageContent {
  const wc = text.split(/\s+/).filter(Boolean).length;
  return {
    text,
    h1,
    h2,
    h3: [],
    outline: [
      ...h1.map((t) => ({ level: 1 as const, text: t })),
      ...h2.map((t) => ({ level: 2 as const, text: t })),
    ],
    headings: h1.length + h2.length,
    paragraphs: Math.ceil(wc / 80),
    wordCount: wc,
    structuredHtml: "",
  };
}

function runCase(name: string, keyword: string, contents: PageContent[]) {
  console.log("\n========================================================");
  console.log(`CAS : ${name}`);
  console.log(`Keyword : "${keyword}"`);
  console.log(`Pages : ${contents.length}, mots cumulés : ${contents.reduce((s, c) => s + c.wordCount, 0)}`);
  console.log("========================================================");

  const nlp = runNLP(contents, keyword);

  console.log("\n— keywordTerms (sous-parties du mot-clé) —");
  if (nlp.keywordTerms && nlp.keywordTerms.length > 0) {
    for (const kt of nlp.keywordTerms) {
      const range = kt.minCount === kt.maxCount ? `×${kt.maxCount}` : `${kt.minCount}-${kt.maxCount}`;
      console.log(
        `  [${kt.kind.padEnd(5)}] "${kt.term}" — ${range} (avg ${kt.avgCount}, présent chez ${kt.presence}%, headings: ${kt.inHeadings ? "oui" : "non"})`,
      );
    }
  } else {
    console.log("  (vide)");
  }

  console.log("\n— Top 15 nlpTerms (champ sémantique) —");
  for (const t of nlp.nlpTerms.slice(0, 15)) {
    const range = t.minCount === t.maxCount ? `×${t.maxCount}` : `${t.minCount}-${t.maxCount}`;
    const isNgram = t.term.includes(" ");
    console.log(
      `  ${isNgram ? "[N]" : "[ ]"} "${t.term}" — score ${t.score.toFixed(2)}, présence ${t.presence}%, ${range} (avg ${t.avgCount})`,
    );
  }

  console.log(`\n— Stats keyword exact —`);
  console.log(`  Avg occurrences : ${nlp.exactKeyword.avgCount}`);
  console.log(`  Densité moyenne : ${nlp.exactKeyword.avgDensity}%`);
  console.log(`  Dans le H1 : ${nlp.exactKeyword.inH1Pct}% des concurrents`);
}

// ────────────────────────────────────────────────────────────────────────────
// CAS 1 : "chaussure pas cher" — transactionnel avec stopword au milieu
// ────────────────────────────────────────────────────────────────────────────
runCase(
  "Chaussure pas cher (transactionnel)",
  "chaussure pas cher",
  [
    makePage(
      "Découvrez notre sélection de chaussures pas cher pour homme et femme. " +
      "Nous proposons des baskets, des sneakers, des chaussures de sport à petit prix. " +
      "Chaussure pas cher livrée en 24h, retours gratuits sous 30 jours. " +
      "Notre catalogue de chaussures pas cher couvre toutes les marques : Nike, Adidas, Puma, Reebok. " +
      "Profitez de promotions et de soldes toute l'année sur les chaussures homme. " +
      "Avec nos prix discount, achetez vos chaussures pas cher en toute confiance. " +
      "Les sneakers homme à prix cassé sont notre spécialité. " +
      "Trouvez votre paire de chaussures à petit prix dès maintenant. " +
      "Mode homme, chaussures de ville, baskets sport : tout pour pas cher.",
      ["Chaussures pas cher pour homme et femme"],
      ["Sneakers et baskets à petit prix", "Chaussures homme en promotion"],
    ),
    makePage(
      "Bienvenue sur le site numéro 1 de la chaussure pas cher en ligne. " +
      "Nous sommes spécialisés dans la vente de chaussures à prix bas pour toute la famille. " +
      "Pas cher mais de qualité : c'est notre engagement depuis 10 ans. " +
      "Chaussure homme, chaussure femme, chaussure enfant : un choix énorme à prix réduits. " +
      "Promotions permanentes, codes promo, soldes monstres sur nos chaussures. " +
      "Les baskets et sneakers en promo dès 19 euros. Stock disponible. " +
      "Chaussures pas cher livraison rapide, paiement sécurisé. " +
      "Notre marque préférée pour les chaussures homme : Nike. " +
      "Découvrez nos top ventes et nos nouveautés chaussures.",
      ["La chaussure pas cher pour toute la famille"],
      ["Pourquoi acheter ses chaussures pas cher chez nous ?"],
    ),
    makePage(
      "Chaussures pas cher : profitez de remises exceptionnelles toute l'année. " +
      "Sneakers, baskets, mocassins, derbies, bottines à petit prix sur notre boutique. " +
      "Marques discount Nike, Adidas, Puma : prix imbattables. " +
      "Le site idéal pour acheter des chaussures pas cher pour homme. " +
      "Mode homme tendance, chaussures sport, chaussures ville à prix cassés. " +
      "Pas cher ne veut pas dire mauvaise qualité. Tous nos produits sont garantis. " +
      "Promo toute l'année, soldes, déstockage permanent.",
      ["Chaussures pas cher homme"],
      ["Marques en promotion", "Sport et ville à petit prix"],
    ),
    makePage(
      "Chaussure pas cher en ligne : le meilleur rapport qualité prix. " +
      "Notre catalogue propose plus de 5000 modèles de chaussures à des prix discount. " +
      "Chaussures homme : derby, mocassin, sneakers, basket. " +
      "Toutes les grandes marques en promotion permanente. " +
      "Profitez de codes promo exclusifs sur les chaussures pas cher. " +
      "Livraison gratuite dès 50 euros sur tout le site. " +
      "Soldes monstres, déstockage : faites des affaires sur les chaussures.",
      ["Chaussures à petits prix"],
      ["Chaussures pas cher homme et femme"],
    ),
    makePage(
      "Achetez vos chaussures pas cher avec notre comparateur de prix. " +
      "Nous référençons les meilleures offres de chaussures à prix bas du web. " +
      "Sneakers homme, baskets sport, chaussures de ville : trouvez le bon prix. " +
      "Promo, soldes, déstockage : ne ratez plus aucune bonne affaire. " +
      "Pas cher signifie économies réelles, pas qualité au rabais. " +
      "Marques sport tendance et chaussures classique homme à prix cassé. " +
      "Comparez les boutiques en un clic et trouvez votre paire moins chère.",
      ["Comparateur chaussures pas cher"],
      ["Comment trouver des chaussures pas cher ?"],
    ),
    makePage(
      "Mode homme à petit prix : retrouvez nos chaussures pas cher tendance. " +
      "Sneakers, derbies, baskets sport en promotion permanente. " +
      "Notre sélection de chaussures pas cher est mise à jour chaque semaine. " +
      "Acheter des chaussures pour homme à des prix raisonnables, c'est possible. " +
      "Nike, Adidas, Puma, New Balance : marques discount sur le catalogue. " +
      "Profitez de la livraison gratuite sur les chaussures dès 60 euros.",
      ["Chaussures homme pas cher"],
      ["Sneakers en promo"],
    ),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// CAS 2 : "comment optimiser le SEO" — informationnel multi-mots avec stopwords
// ────────────────────────────────────────────────────────────────────────────
runCase(
  "Comment optimiser le SEO (informationnel)",
  "comment optimiser le SEO",
  [
    makePage(
      "Comment optimiser le SEO de son site web en 2026 ? Voici notre guide complet. " +
      "Le référencement naturel demande une stratégie de contenu, des backlinks de qualité et une optimisation technique. " +
      "Optimiser son SEO passe par les balises title, meta description, et la structure des H1/H2. " +
      "Une bonne stratégie de mots clés est essentielle pour optimiser le SEO d'un site. " +
      "Le SEO technique inclut la vitesse de chargement, le mobile-first et le maillage interne. " +
      "Pour optimiser le référencement, il faut aussi penser à l'expérience utilisateur. " +
      "Le contenu de qualité reste le pilier du SEO en 2026.",
      ["Comment optimiser le SEO de son site"],
      ["Optimiser le contenu", "Optimiser la technique"],
    ),
    makePage(
      "Le SEO ou référencement naturel est un levier stratégique pour les entreprises. " +
      "Optimiser son site pour Google demande méthode et patience. " +
      "Voici les étapes pour optimiser le SEO efficacement. " +
      "1. Recherche de mots clés. 2. Optimisation on-page. 3. Création de contenu. 4. Netlinking. " +
      "Optimiser le contenu de chaque page selon l'intention de recherche est primordial. " +
      "L'audit SEO permet d'identifier les axes d'optimisation prioritaires. " +
      "Comment optimiser le SEO d'une fiche produit ? Travaillez le title, la meta et le contenu unique.",
      ["Guide pour optimiser le SEO"],
      ["Audit SEO préalable", "Optimisation on-page"],
    ),
    makePage(
      "Optimiser le SEO de son site demande de connaître les fondamentaux du référencement. " +
      "Les algorithmes de Google évoluent, mais les bases restent : contenu, technique, popularité. " +
      "Pour optimiser le SEO, commencez par un audit complet. " +
      "Mots clés, balises, maillage, performance : chaque levier compte. " +
      "Le SEO local nécessite une fiche Google Business Profile optimisée. " +
      "Comment optimiser le SEO d'un blog ? Publiez régulièrement du contenu de qualité.",
      ["Optimiser le SEO en 2026"],
      ["Les bases du SEO", "Optimisation technique"],
    ),
    makePage(
      "Comment optimiser le SEO ? Voici 10 conseils concrets. " +
      "Travaillez vos mots clés, structurez vos contenus, soignez vos balises title et meta description. " +
      "Optimiser ses URLs est aussi crucial pour le référencement. " +
      "Le netlinking reste un facteur fort de l'algorithme Google. " +
      "Pour optimiser le SEO d'une page produit, ajoutez du contenu unique et des avis clients. " +
      "L'optimisation mobile et la vitesse impactent directement le ranking SEO.",
      ["10 conseils pour optimiser le SEO"],
      ["Optimisation des balises", "Stratégie de contenu"],
    ),
    makePage(
      "Optimiser le SEO de son site WordPress demande une approche structurée. " +
      "Les plugins SEO comme Yoast facilitent l'optimisation des balises. " +
      "Mais le contenu reste la clé pour optimiser le référencement. " +
      "Pour optimiser le SEO, pensez aussi aux Core Web Vitals et au mobile. " +
      "L'analyse des concurrents permet d'identifier les opportunités SEO. " +
      "Comment optimiser le SEO d'un e-commerce ? Travaillez les fiches produits et les catégories.",
      ["Optimiser le SEO WordPress"],
      ["Plugins SEO", "Optimisation du contenu"],
    ),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// CAS 3 : "café à emporter" — bigramme avec préposition au milieu
// ────────────────────────────────────────────────────────────────────────────
runCase(
  "Café à emporter (préposition au milieu)",
  "café à emporter",
  [
    makePage(
      "Le café à emporter est devenu une habitude pour les actifs urbains. " +
      "Notre carte de café à emporter propose espresso, latte, cappuccino. " +
      "Café à emporter chaud, café glacé, thé : tout est disponible. " +
      "Notre boutique de café à emporter ouvre dès 7h. " +
      "Découvrez nos formules petit déjeuner avec café à emporter. " +
      "Café qualité, prix raisonnable, service rapide : la promesse de notre boutique.",
      ["Café à emporter — notre carte"],
      ["Espresso à emporter", "Latte à emporter"],
    ),
    makePage(
      "Café à emporter Paris : trouvez les meilleures adresses près de chez vous. " +
      "Notre sélection de coffee shops propose un café à emporter de qualité. " +
      "Café à emporter bio, équitable, torréfié sur place. " +
      "Les meilleures cafés à emporter de la capitale sont chez nous. " +
      "Espresso, americano, latte : une carte complète à emporter.",
      ["Café à emporter Paris"],
      ["Coffee shops parisiens"],
    ),
    makePage(
      "Boire un café à emporter, c'est gagner du temps le matin. " +
      "Notre chaîne de café à emporter compte 50 boutiques en France. " +
      "Café à emporter bio, expresso italien, cappuccino crémeux. " +
      "Notre carte café à emporter est mise à jour chaque saison. " +
      "Programme de fidélité sur tous les cafés à emporter.",
      ["Café à emporter en France"],
      ["Programme fidélité"],
    ),
    makePage(
      "Café à emporter : la nouvelle tendance des boissons chaudes. " +
      "Espresso, ristretto, latte, mocha : variez les plaisirs avec notre café à emporter. " +
      "Le café à emporter répond aux besoins des urbains pressés. " +
      "Café à emporter de qualité, grains sélectionnés, torréfaction artisanale. " +
      "Découvrez aussi nos cafés à emporter glacés pour l'été.",
      ["Café à emporter qualité"],
      ["Variétés disponibles"],
    ),
  ],
);
