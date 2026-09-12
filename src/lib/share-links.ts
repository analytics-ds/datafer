/**
 * Génération des liens de partage public (dossiers + briefs).
 *
 * Le token vit dans `client.share_token` (dossier) ou `brief.share_token`
 * (brief). Il n'a volontairement PAS de date d'expiration : un lien envoyé
 * à un client reste valide tant qu'on ne le révoque pas explicitement.
 *
 * Utilisé par les server actions de l'UI et par l'API v1.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { CorpusEnv } from "./corpus-env";

/** Token opaque 32 octets, base64url, même forme que les tokens de l'UI. */
export function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Base publique des liens partagés. On privilégie BETTER_AUTH_URL
 * (https://corpus.datashake.fr) : l'origine de la requête est l'URL
 * workers.dev quand l'appel API tape le worker en direct, et ce n'est pas
 * une URL qu'on envoie à un client.
 */
export function shareBaseUrl(req: Request): string {
  let base: string | undefined;
  try {
    base = (getCloudflareContext().env as unknown as CorpusEnv).BETTER_AUTH_URL;
  } catch {
    base = undefined;
  }
  if (!base) base = new URL(req.url).origin;
  return base.replace(/\/+$/, "");
}

export function folderShareUrl(req: Request, token: string): string {
  return `${shareBaseUrl(req)}/share/${token}`;
}

export function briefShareUrl(req: Request, token: string): string {
  return `${shareBaseUrl(req)}/share-brief/${token}`;
}
