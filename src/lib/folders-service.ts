/**
 * Règles pures autour des dossiers (clients), partagées par l'API v1.
 *
 * Pourquoi ce module : un outil tiers (Cluster Map) crée des dossiers par
 * l'API et les rapproche de ses propres clients. Il faut qu'une même entreprise
 * ne se retrouve jamais en deux dossiers parce que l'un a été saisi
 * « https://www.skello.io/ » et l'autre « skello.io », ou « Rip Curl » et
 * « rip curl ». Le rapprochement se fait d'abord sur le domaine, puis sur le nom.
 */

/** Domaine nu d'un site saisi à la main : « https://www.Skello.io/fr » -> « skello.io ». */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** Nom comparable : sans accents, sans casse, espaces et ponctuation ramenés à un seul blanc. */
export function normalizeFolderName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type FolderLike = { id: string; name: string; website: string | null };

/**
 * Dossier existant qui désigne la même entreprise, ou null. Le domaine prime :
 * deux dossiers au même domaine sont le même client, quel que soit leur nom.
 * Le nom ne sert qu'à défaut de domaine des deux côtés, pour ne pas confondre
 * deux entreprises homonymes aux sites différents.
 */
export function findMatchingFolder<T extends FolderLike>(
  rows: T[],
  wanted: { name: string; website?: string | null },
): T | null {
  const host = normalizeWebsite(wanted.website);
  if (host) {
    const parHote = rows.find((r) => normalizeWebsite(r.website) === host);
    if (parHote) return parHote;
  }
  const nom = normalizeFolderName(wanted.name);
  if (!nom) return null;
  return (
    rows.find(
      (r) =>
        normalizeFolderName(r.name) === nom &&
        (!host || !normalizeWebsite(r.website)),
    ) ?? null
  );
}
