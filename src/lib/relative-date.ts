/**
 * "27 days ago" façon Surfer, en français.
 */
export function relativeDate(input: Date | number | null | undefined): string {
  if (!input) return "—";
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return "—";

  const now = Date.now();
  const diffSec = Math.round((now - date.getTime()) / 1000);

  if (diffSec < 60) return "à l'instant";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `il y a ${diffHour} h`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `il y a ${diffDay} j`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return `il y a ${diffMonth} mois`;
  const diffYear = Math.round(diffMonth / 12);
  return `il y a ${diffYear} an${diffYear > 1 ? "s" : ""}`;
}
