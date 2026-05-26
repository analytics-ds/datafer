// Helper Bright Data Web Unlocker pour le module maillage. Pattern repris
// de `crawlWithBrightData` dans `analysis.ts` mais isolé ici pour éviter
// le cycle de dépendances et pour pouvoir tuner les timeouts maillage
// indépendamment des crawls de SERP top 10.
//
// Endpoint : POST https://api.brightdata.com/request
// Tarif (mai 2026) : $1.50/CPM standard, +$1/CPM sur domaines premium.
// Utilisé uniquement en fallback du fetch direct, donc en pratique seulement
// sur les sites protégés (Datadome, Cloudflare WAF, PerimeterX...).

export type BrightDataEnv = {
  BRIGHTDATA_TOKEN?: string;
  BRIGHTDATA_ZONE?: string;
};

// Récupère le contenu (HTML ou XML) d'une URL via Bright Data Unlocker.
// Retourne null si non configuré ou si la requête échoue.
export async function brightDataFetch(
  url: string,
  env: BrightDataEnv,
  opts: { timeoutMs?: number; country?: string } = {},
): Promise<string | null> {
  const token = env.BRIGHTDATA_TOKEN;
  const zone = env.BRIGHTDATA_ZONE;
  if (!token || !zone) return null;

  try {
    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        zone,
        url,
        format: "raw",
        country: opts.country ?? "fr",
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 50000),
    });
    if (!r.ok) {
      console.log(`[maillage:bd] http=${r.status} url=${url}`);
      return null;
    }
    const body = await r.text();
    return body;
  } catch (e) {
    console.log(`[maillage:bd] exception url=${url} err=${(e as Error).message}`);
    return null;
  }
}

// Détection grossière d'un challenge anti-bot servi en HTML/JSON au lieu
// du contenu attendu. Réutilisé sur le HTML brut renvoyé par Bright Data
// ou par fetch direct pour décider de fallback / retry.
export function looksLikeChallengePage(body: string): boolean {
  if (!body) return false;
  const lower = body.slice(0, 2000).toLowerCase();
  return (
    lower.includes("datadome") ||
    lower.includes("captcha-delivery") ||
    lower.includes("please enable js") ||
    lower.includes("perimeterx") ||
    lower.includes("__cf_chl") ||
    lower.includes("just a moment...") ||
    lower.includes("checking your browser") ||
    lower.includes("incapsula")
  );
}
