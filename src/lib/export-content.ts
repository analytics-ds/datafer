/**
 * Génération des artefacts d'export pour un brief.
 *
 * Volontairement minimal : on n'embarque QUE le contenu rédigé (`editorHtml`).
 * Pas de sidebar SERP / NLP / score, ce sont des données internes.
 */

const SAFE_FILENAME_RE = /[^a-z0-9-_]/gi;

export function safeFilename(keyword: string): string {
  const slug = keyword
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(SAFE_FILENAME_RE, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "brief";
}

/**
 * Document HTML autonome : structure standard, charset UTF-8,
 * styles minimaux pour rendre le contenu lisible hors de l'éditeur.
 */
export function renderHtmlDocument(keyword: string, bodyHtml: string): string {
  const title = escapeHtml(keyword);
  const body = bodyHtml || "<p><em>Contenu vide.</em></p>";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 760px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #222; }
  h1 { font-size: 32px; margin-top: 32px; }
  h2 { font-size: 24px; margin-top: 28px; }
  h3 { font-size: 18px; margin-top: 22px; }
  p { margin: 12px 0; }
  ul, ol { padding-left: 24px; }
  li { margin-bottom: 4px; }
  a { color: #0e5132; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Document Word (.doc) : c'est en fait un fichier HTML enveloppé d'en-têtes
 * `xmlns:office`/`xmlns:word`, que Word/Pages reconnaissent en double-cliquant
 * sur le fichier `.doc`. Aucune dépendance npm, marche sur Cloudflare Workers.
 */
export function renderDocDocument(keyword: string, bodyHtml: string): string {
  const title = escapeHtml(keyword);
  const body = bodyHtml || "<p><em>Contenu vide.</em></p>";
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${title}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument>
</xml><![endif]-->
<style>
  @page { margin: 2cm; }
  body { font-family: Calibri, "Segoe UI", sans-serif; font-size: 11pt; line-height: 1.6; }
  h1 { font-size: 22pt; margin-top: 18pt; }
  h2 { font-size: 16pt; margin-top: 16pt; }
  h3 { font-size: 13pt; margin-top: 12pt; }
  p { margin: 0 0 8pt; }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
  th, td { border: 1px solid #999; padding: 6pt 9pt; text-align: left; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Page imprimable (PDF via window.print()). Auto-déclenche le dialog
 * d'impression au chargement, et propose un bouton « Imprimer » pour
 * relancer manuellement.
 */
export function renderPrintDocument(keyword: string, bodyHtml: string): string {
  const title = escapeHtml(keyword);
  const body = bodyHtml || "<p><em>Contenu vide.</em></p>";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 760px; margin: 32px auto; padding: 0 24px; line-height: 1.7; color: #222; }
  h1 { font-size: 30px; margin-top: 26px; }
  h2 { font-size: 22px; margin-top: 22px; }
  h3 { font-size: 17px; margin-top: 18px; }
  p { margin: 10px 0; }
  ul, ol { padding-left: 24px; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; }
  th, td { border: 1px solid #bbb; padding: 8px 12px; text-align: left; }
  img { max-width: 100%; height: auto; }
  .print-bar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #eee; padding: 10px 0; margin-bottom: 24px; display: flex; gap: 12px; align-items: center; }
  .print-bar button { font: inherit; padding: 6px 12px; border: 1px solid #222; background: #222; color: #fff; cursor: pointer; border-radius: 4px; }
  .print-bar .hint { color: #666; font-size: 13px; }
  @media print {
    .print-bar { display: none; }
    body { margin: 0; padding: 0; }
  }
</style>
</head>
<body>
<div class="print-bar">
  <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  <span class="hint">Astuce : choisis « Enregistrer au format PDF » comme imprimante.</span>
</div>
${body}
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
