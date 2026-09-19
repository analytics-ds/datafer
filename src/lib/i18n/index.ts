import { fr } from "./dictionaries/fr";
import { en } from "./dictionaries/en";
import { DEFAULT_LOCALE, type Locale } from "./types";

export * from "./types";

export type TranslationKey = keyof typeof fr;

/** Dictionnaire complet d'une locale. `en` est typé sur `fr` : une clé oubliée
 *  dans la traduction anglaise casse le build, elle ne passe pas en prod. */
export type Dictionary = Record<TranslationKey, string>;

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export type TranslateParams = Record<string, string | number>;

/**
 * Traduit une clé et interpole les paramètres `{nom}`.
 *
 * Si la clé manque dans la locale demandée on retombe sur le français plutôt
 * que d'afficher la clé brute : une chaîne dans la mauvaise langue reste
 * lisible, `editor.score.title` ne l'est pas.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslateParams,
): string {
  const dict = getDictionary(locale);
  const raw = dict[key] ?? fr[key] ?? (key as string);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type Translator = (key: TranslationKey, params?: TranslateParams) => string;

/** Traducteur lié à une locale, à passer aux composants serveur. */
export function createTranslator(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}
