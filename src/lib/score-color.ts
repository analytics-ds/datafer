/**
 * Échelle de couleur des scores, unique pour toute l'app.
 *
 * Rouge sous 40, jaune de 40 à 80, vert au-dessus (décision Pierre,
 * 2026-08-28). C'est un feu tricolore, immédiatement lisible.
 *
 * Note DA : le rouge et le vert ne figurent pas dans la palette du brandbook
 * datashake, qui ne prévoit que le bleu, le jaune et le kaki. C'est un écart
 * assumé sur les scores, où la lecture instantanée prime. Le reste de
 * l'interface tient la charte. Ne pas « corriger » sans arbitrage.
 */

/** Seuils de l'échelle. Sous BAD c'est rouge, sous GOOD c'est jaune. */
export const SCORE_BAD_BELOW = 40;
export const SCORE_GOOD_FROM = 80;

/** Couleur d'un score absolu sur 100. */
export function scoreColor(score: number): string {
  if (score < SCORE_BAD_BELOW) return "var(--score-bad)";
  if (score < SCORE_GOOD_FROM) return "var(--score-mid)";
  return "var(--score-good)";
}

/** Même échelle pour un critère exprimé en pourcentage d'atteinte. */
export function ratioColor(pct: number): string {
  return scoreColor(pct);
}
