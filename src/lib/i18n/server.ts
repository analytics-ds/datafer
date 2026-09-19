import "server-only";
import { cookies } from "next/headers";
import { createTranslator, type Translator } from "./index";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./types";

/**
 * Résout la langue d'affichage côté serveur.
 *
 * Ordre de priorité, du plus explicite au plus implicite :
 *  1. le cookie posé par le sélecteur du header — un choix humain gagne
 *     toujours, y compris pour un client externe sans compte ;
 *  2. la langue du dossier client, qui porte la langue de l'équipe à qui on
 *     partage le lien (un dossier US s'ouvre en anglais sans réglage) ;
 *  3. le français.
 */
export async function resolveLocale(folderLocale?: string | null): Promise<Locale> {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  if (isLocale(folderLocale)) return folderLocale;
  return DEFAULT_LOCALE;
}

export async function getTranslator(folderLocale?: string | null): Promise<Translator> {
  return createTranslator(await resolveLocale(folderLocale));
}
