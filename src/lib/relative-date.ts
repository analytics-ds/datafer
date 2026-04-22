/**
 * Format court d'une date de création (ex. "14 avr. 2026").
 * Pas d'heure ni de format relatif : on veut savoir le jour, pas combien de
 * temps s'est écoulé.
 */
export function formatDate(input: Date | number | null | undefined): string {
  if (!input) return "·";
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return "·";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Ancien alias conservé pour ne pas casser les imports existants pendant la
// transition vers formatDate.
export const relativeDate = formatDate;
