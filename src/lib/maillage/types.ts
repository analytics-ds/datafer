// Types partagés du module maillage interne.

export type SitemapUrl = {
  loc: string;
  // lastmod n'est PAS utilisé pour décider d'un re-crawl (souvent absent ou
  // mensonger, cf. WordPress qui met now() partout). Stocké si dispo mais
  // pas dans le pipeline de fraîcheur, qui s'appuie sur HEAD + hash.
  lastmod?: string;
};

export type CrawledUrlContent = {
  url: string;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  // Premier paragraphe significatif (>=15 mots), 200 mots max.
  firstParagraph: string | null;
  // Headers HTTP au moment du crawl, pour la prochaine vérification.
  etag: string | null;
  lastModifiedHeader: string | null;
  // Hash SHA-256 du concat normalisé title|h1|meta|firstParagraph.
  contentHash: string;
};

export type MaillageSuggestion = {
  // URL cible à insérer dans le texte.
  url: string;
  title: string | null;
  // Ancre proposée, extraite du paragraphe source (jamais d'un heading).
  anchor: string;
  // Index 0-based du paragraphe dans l'éditeur où l'ancre doit être insérée.
  // Toujours un <p>, jamais un h1/h2/h3 (garanti par le moteur de suggestion).
  paragraphIndex: number;
  // Aperçu (60 chars) du paragraphe cible pour l'UI.
  paragraphPreview: string;
  // Cosinus similarity entre paragraphe et URL cible.
  score: number;
};

export type SitemapSyncMode = "initial" | "incremental";

export type SitemapSyncMessage = {
  type: "sitemap-sync";
  clientId: string;
  mode: SitemapSyncMode;
};
