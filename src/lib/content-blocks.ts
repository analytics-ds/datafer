/**
 * Découpage d'un HTML en blocs de contenu. Module feuille, sans dépendance :
 * il est importé par le scoring, par l'analyse (calcul de la référence
 * concurrente) et par l'éditeur.
 */

/** Longueur minimale d'un bloc pour compter comme un « paragraphe ». */
export const MIN_BLOCK_CHARS = 20;

/**
 * Textes des blocs de contenu, dans l'ordre du document.
 *
 * Primitive unique du comptage de blocs : utilisée par l'éditeur (via son
 * innerHTML), par le scoring serveur (htmlToEditorData), par le scoring des
 * concurrents (leur `structuredHtml`) et par le calcul de la référence
 * `avgBlocks`. Avant le 2026-09-06, chaque chemin comptait à sa façon : le
 * contenu concurrent arrivait sur une seule ligne (`paragraphs.join(" ")` dans
 * extractContent), donc le critère structure, qui splittait sur `\n\n`, voyait
 * UN bloc et donnait 1/6 à tous les concurrents, contre 5 ou 6/6 au même
 * contenu côté user. Le `best` que l'API et l'UI donnent à battre était donc
 * sous-évalué d'environ 4 points.
 */
export function htmlToBlockTexts(html: string): string[] {
  return html
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|div)\s*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > MIN_BLOCK_CHARS);
}
