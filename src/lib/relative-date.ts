import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/types";

/** Code BCP 47 pour les API Intl. `fr` seul donnerait des formats canadiens
 *  sur certains runtimes, on épingle le pays. */
const INTL_LOCALES: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-US",
};

export function intlLocale(locale: Locale = DEFAULT_LOCALE): string {
  return INTL_LOCALES[locale] ?? INTL_LOCALES[DEFAULT_LOCALE];
}

/**
 * Format court d'une date de création (« 14 avr. 2026 », « Apr 14, 2026 »).
 * Pas d'heure ni de format relatif : on veut savoir le jour, pas combien de
 * temps s'est écoulé.
 */
export function formatDate(
  input: Date | number | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!input) return "·";
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return "·";
  return date.toLocaleDateString(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Séparateur de milliers de la locale : 12 000 en français, 12,000 en anglais. */
export function formatNumber(
  value: number | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (value == null) return "—";
  return value.toLocaleString(intlLocale(locale));
}

// Ancien alias conservé pour ne pas casser les imports existants pendant la
// transition vers formatDate.
export const relativeDate = formatDate;
