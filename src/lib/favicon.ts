/**
 * Renvoie l'URL d'un favicon pour un site donné (service gratuit Google).
 * Utilisé pour représenter un dossier client par le favicon de son site
 * plutôt qu'une pastille colorée.
 */
export function faviconUrl(website: string | null | undefined, size = 64): string | null {
  if (!website) return null;
  let host: string;
  try {
    host = new URL(website).hostname;
  } catch {
    const m = website.match(/([a-z0-9-]+\.[a-z0-9-.]+)/i);
    if (!m) return null;
    host = m[1];
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
