/**
 * Tests edge-cases de la pipeline NLP : keyword 1 mot, keyword long,
 * keyword avec chiffre, keyword pluriel, keyword e-commerce niche.
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
    imageCount: 0,
  };
}

function runCase(name: string, keyword: string, contents: PageContent[]) {
  console.log("\n========================================================");
  console.log(`CAS : ${name}`);
  console.log(`Keyword : "${keyword}" (${keyword.split(/\s+/).length} mots)`);
  console.log(`Pages : ${contents.length}, mots cumulés : ${contents.reduce((s, c) => s + c.wordCount, 0)}`);
  console.log("========================================================");

  const nlp = runNLP(contents, keyword);

  console.log("\n— keywordTerms —");
  if (nlp.keywordTerms && nlp.keywordTerms.length > 0) {
    for (const kt of nlp.keywordTerms) {
      const range = kt.minCount === kt.maxCount ? `×${kt.maxCount}` : `${kt.minCount}-${kt.maxCount}`;
      console.log(`  [${kt.kind.padEnd(5)}] "${kt.term}" — ${range} (avg ${kt.avgCount}, ${kt.presence}%)`);
    }
  } else {
    console.log("  (vide)");
  }

  console.log("\n— Top 12 nlpTerms —");
  for (const t of nlp.nlpTerms.slice(0, 12)) {
    const range = t.minCount === t.maxCount ? `×${t.maxCount}` : `${t.minCount}-${t.maxCount}`;
    const isNgram = t.term.includes(" ");
    console.log(`  ${isNgram ? "[N]" : "[ ]"} "${t.term}" — score ${t.score.toFixed(2)}, ${t.presence}%, ${range}`);
  }
}

// CAS A : keyword 1 mot
runCase("Keyword 1 mot — voyage", "voyage", [
  makePage(
    "Préparez votre prochain voyage avec notre agence en ligne. Voyages organisés, voyage sur mesure, " +
    "voyage en groupe : nos conseillers voyage vous accompagnent. Destinations Asie, Afrique, Amériques. " +
    "Voyage de noces, voyage en famille, voyage solo : trouvez l'inspiration pour votre prochain voyage. " +
    "Réservez votre voyage en ligne avec paiement sécurisé. Assurance voyage incluse.",
    ["Agence de voyage en ligne"],
    ["Voyage organisé", "Voyage sur mesure"],
  ),
  makePage(
    "Notre comparateur de voyages vous permet de trouver le meilleur prix pour votre voyage. " +
    "Voyages tout compris, voyage dernière minute, voyage en avion ou en train. " +
    "Découvrez nos offres de voyage exceptionnelles. Le voyage commence ici. " +
    "Vols, hôtels, location de voitures pour votre voyage : tout au même endroit.",
    ["Comparateur voyage"],
    ["Meilleur voyage", "Offres voyage"],
  ),
  makePage(
    "Carnet de voyage : nos conseils pour bien préparer son voyage. Visa, vaccins, valise, assurance voyage. " +
    "Le voyage idéal commence par une bonne préparation. Voyage en avion : guide pratique. " +
    "Voyage low cost ou voyage de luxe ? Nos comparatifs pour tous les budgets de voyage.",
    ["Préparer son voyage"],
    ["Conseils voyage", "Budget voyage"],
  ),
  makePage(
    "Idées de voyage pour 2026. Voyage culturel, voyage aventure, voyage détente : choisissez votre style de voyage. " +
    "Voyage en Europe, voyage hors Europe : nos top destinations. Le voyage est un art de vivre. " +
    "Pour un voyage réussi, choisissez la bonne période et la bonne agence.",
    ["Idées voyage 2026"],
    ["Style de voyage"],
  ),
]);

// CAS B : keyword très long
runCase(
  "Keyword 6 mots — comment choisir son assurance auto en ligne",
  "comment choisir son assurance auto en ligne",
  [
    makePage(
      "Comment choisir son assurance auto en ligne en 2026 ? Voici notre guide complet. " +
      "Choisir une assurance auto en ligne demande de comparer les garanties, le prix et les services. " +
      "L'assurance auto en ligne offre des tarifs souvent plus bas que les assureurs traditionnels. " +
      "Pour bien choisir son assurance auto, comparez au moins 5 devis. " +
      "Comment choisir : franchise, plafond de remboursement, assistance 24/7. " +
      "Notre comparateur d'assurance auto en ligne est gratuit. " +
      "Choisir la bonne assurance auto, c'est protéger son budget et son véhicule.",
      ["Comment choisir son assurance auto en ligne"],
      ["Comparer les garanties", "Choisir le bon assureur"],
    ),
    makePage(
      "Souscrire une assurance auto en ligne : tout ce qu'il faut savoir. " +
      "Choisir son assurance auto demande méthode. Voici comment choisir efficacement. " +
      "Comparez les offres d'assurance auto en ligne sur notre comparateur. " +
      "Comment choisir son assurance auto au meilleur prix ? Astuces et conseils. " +
      "Assurance tous risques, au tiers, intermédiaire : comment choisir la bonne formule. " +
      "Souscrire en ligne en 5 minutes, devis instantané, signature électronique.",
      ["Souscrire son assurance auto en ligne"],
      ["Choisir sa formule", "Comparer les prix"],
    ),
    makePage(
      "Assurance auto en ligne : guide d'achat complet. " +
      "Comment choisir son assurance auto sans se tromper ? Suivez nos 7 étapes. " +
      "1. Évaluer ses besoins. 2. Comparer les devis en ligne. 3. Lire les garanties. " +
      "Choisir une assurance auto adaptée à son profil de conducteur est essentiel. " +
      "Bonus, malus, franchise : tout comprendre avant de choisir son assurance.",
      ["Guide assurance auto en ligne"],
      ["Évaluer ses besoins", "Comparer les devis"],
    ),
  ],
);

// CAS C : keyword avec chiffre
runCase("Keyword avec chiffre — iphone 15 prix", "iphone 15 prix", [
  makePage(
    "iPhone 15 prix : découvrez les meilleures offres du moment. " +
    "Le iPhone 15 est disponible à partir de 969€. iPhone 15 Pro à partir de 1229€. " +
    "Comparez les prix de l'iPhone 15 chez tous les revendeurs. " +
    "iPhone 15 reconditionné : prix bas, garantie 12 mois. " +
    "Promotion iPhone 15 chez Apple, Fnac, Amazon, Boulanger.",
    ["iPhone 15 prix et offres"],
    ["Prix iPhone 15", "iPhone 15 reconditionné"],
  ),
  makePage(
    "Le prix de l'iPhone 15 a baissé en 2026. iPhone 15 128 Go à 869€. " +
    "iPhone 15 Pro Max prix : 1479€ chez Apple. Trouvez le meilleur prix iPhone 15. " +
    "Comparateur prix iPhone 15 : nous référençons 50 boutiques. " +
    "Économisez sur votre iPhone 15 avec nos codes promo exclusifs.",
    ["Prix iPhone 15 - Comparateur"],
    ["Promo iPhone 15"],
  ),
  makePage(
    "iPhone 15 : test, prix, avis. Le smartphone Apple iPhone 15 vaut-il son prix ? " +
    "Notre comparatif de prix iPhone 15 toutes les versions. " +
    "iPhone 15, iPhone 15 Plus, iPhone 15 Pro, iPhone 15 Pro Max : prix et fiches techniques. " +
    "Acheter iPhone 15 en promotion : nos bons plans du moment.",
    ["iPhone 15 : prix et avis"],
    ["Versions iPhone 15"],
  ),
  makePage(
    "Apple iPhone 15 prix officiel et promotions. Le iPhone 15 démarre à 969€. " +
    "Comparez les prix iPhone 15 entre opérateurs et revendeurs. " +
    "iPhone 15 prix reconditionné dès 749€. Garantie constructeur 1 an. " +
    "iPhone 15 prix promo : économisez jusqu'à 200€ sur les modèles 2025.",
    ["Apple iPhone 15 - prix"],
    ["Comparatif prix iPhone 15"],
  ),
]);

// CAS D : keyword pluriel
runCase("Keyword pluriel — chaussures pas cher", "chaussures pas cher", [
  makePage(
    "Chaussures pas cher pour homme et femme. Notre catalogue de chaussures pas cher couvre toutes les marques. " +
    "Chaussure homme, chaussures femme à prix discount. Pas cher, livraison rapide. " +
    "Sneakers, baskets, derbies à petit prix. Chaussures pas cher en promo permanente.",
    ["Chaussures pas cher"],
    ["Chaussure homme pas cher", "Chaussures femme pas cher"],
  ),
  makePage(
    "Site spécialisé chaussures pas cher. Chaussure pas cher en stock, livraison 24h. " +
    "Chaussures de sport, chaussures de ville, chaussures de soirée : tout pour pas cher. " +
    "Chaussure pas cher mais qualité garantie. Pas cher ne veut pas dire mauvaise qualité.",
    ["Chaussures pas cher en ligne"],
    ["Pourquoi acheter chaussures pas cher"],
  ),
  makePage(
    "Chaussures pas cher : nos meilleures offres du moment. " +
    "Découvrez plus de 5000 modèles de chaussures à petit prix. " +
    "Chaussures pas cher pour toute la famille : homme, femme, enfant. " +
    "Promotion chaussures, soldes chaussures, déstockage permanent.",
    ["Chaussures pas cher - Catalogue"],
    ["Chaussures homme", "Chaussures femme"],
  ),
]);

// CAS E : keyword e-commerce niche
runCase("Keyword e-commerce niche — robe noire mariage", "robe noire mariage", [
  makePage(
    "Robe noire mariage : élégance et raffinement pour vos cérémonies. " +
    "Notre collection de robe noire pour mariage : robes longues, robes courtes, robes de cocktail. " +
    "Une robe noire pour mariage est idéale pour assister à une cérémonie en toute élégance. " +
    "Robe noire mariage invité, robe noire dentelle, robe noire bohème : large choix. " +
    "Trouvez la robe noire mariage parfaite pour votre morphologie.",
    ["Robe noire mariage"],
    ["Robe noire longue mariage", "Robe noire courte mariage"],
  ),
  makePage(
    "Robe noire pour mariage : guide de style pour invités. " +
    "Quelle robe noire choisir pour un mariage ? Conseils mode et tendances. " +
    "La robe noire mariage classique reste un intemporel élégant. " +
    "Robe noire mariage civil, robe noire mariage soir : adapter sa tenue. " +
    "Accessoiriser sa robe noire pour un mariage : bijoux, sac, chaussures.",
    ["Robe noire pour mariage"],
    ["Comment porter la robe noire au mariage", "Accessoires robe noire"],
  ),
  makePage(
    "Robe noire mariage : notre top des plus belles robes 2026. " +
    "Sélection de robes noires pour mariage : modèles courtes, longues, mi-longues. " +
    "La robe noire est une valeur sûre pour assister à un mariage. " +
    "Robe noire mariage chic, robe noire mariage bohème : tous les styles. " +
    "Marques tendance pour votre robe noire de mariage.",
    ["Top robe noire mariage 2026"],
    ["Robe noire chic", "Robe noire bohème"],
  ),
  makePage(
    "Acheter une robe noire pour un mariage : nos conseils. " +
    "Une robe noire mariage doit être élégante sans être austère. " +
    "Robe noire courte ou longue ? Tout dépend du protocole du mariage. " +
    "Conseil : éviter le total look noir pour un mariage. Accessoirisez votre robe.",
    ["Acheter robe noire mariage"],
    ["Conseils robe noire"],
  ),
]);
