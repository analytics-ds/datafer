/**
 * Socle i18n de corpus.
 *
 * Deux langues seulement : le français (langue de travail des consultants) et
 * l'anglais (clients US/UK à qui on partage un lien de brief). Pas de lib
 * externe : on tourne sur Workers via OpenNext, et un dictionnaire typé suffit
 * largement pour deux locales — ça évite un middleware de routing et un
 * segment `/[locale]` dans toutes les URLs, qui casserait les liens de partage
 * déjà envoyés aux clients.
 */
export const LOCALES = ["fr", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Nom du cookie qui porte le choix explicite de langue (sélecteur du header). */
export const LOCALE_COOKIE = "corpus_locale";

/** Un an : le choix de langue n'a aucune raison d'expirer en cours de mission. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Libellé natif de chaque langue, pour le sélecteur. */
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};
