// Helpers partagés entre l'API v1 « folders » et les server actions de l'UI.
// Un dossier = une row `client` (cf. src/db/schema.ts).

import { eq, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { client } from "@/db/schema";

export type FolderRow = typeof client.$inferSelect;

/** Dossiers lisibles par ce user : tous les "agency" + ses propres "personal". */
export function visibleTo(userId: string): SQL {
  return or(eq(client.scope, "agency"), eq(client.ownerId, userId))!;
}

/** Payload public d'un dossier. Ne fuite jamais le shareToken. */
export function serializeFolder(row: FolderRow) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    scope: row.scope,
    notes: row.notes,
    sitemapUrl: row.sitemapUrl,
    shared: !!row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** URL normalisée, `null` si vide, `Error` si invalide. */
export function normalizeUrl(value: string | null | undefined): string | null | Error {
  if (value === undefined || value === null || value.trim() === "") return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return new Error("must be http(s)");
    }
    return u.href;
  } catch {
    return new Error("invalid URL");
  }
}

/**
 * Un autre dossier visible porte-t-il déjà ce nom ? Sert au renommage (UI et
 * API) pour éviter deux dossiers « Celio » que personne ne sait distinguer.
 */
export async function nameTaken(
  userId: string,
  name: string,
  exceptId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: client.id })
    .from(client)
    .where(
      sql`${visibleTo(userId)} AND lower(${client.name}) = ${name.toLowerCase()} AND ${client.id} <> ${exceptId}`,
    )
    .limit(1);
  return !!row;
}
