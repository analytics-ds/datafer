import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, briefTag, tag } from "@/db/schema";

// Palette autorisée (alignée avec l'UI). Le serveur valide pour éviter qu'un
// client n'injecte n'importe quelle couleur dans la base.
export const TAG_COLORS = [
  "#5B8DEF", // bleu
  "#22A06B", // vert
  "#E8704A", // orange
  "#D14343", // rouge
  "#9B5BDF", // violet
  "#E0A03B", // ocre
  "#3FA8A3", // turquoise
  "#7A6E5C", // taupe
] as const;

export type TagColor = (typeof TAG_COLORS)[number];
export type TagSource = "agency" | "client";

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 40);
}

/**
 * Liste tous les tags de la base, avec leur clientId pour pouvoir grouper
 * dans la barre de filtres globale (page « Tous les briefs »).
 */
export async function listAllTags() {
  const db = getDb();
  return db
    .select({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      clientId: tag.clientId,
    })
    .from(tag)
    .orderBy(tag.name);
}

/** Tags d'un client donné. */
export async function listTagsForClient(clientId: string) {
  const db = getDb();
  return db
    .select({ id: tag.id, name: tag.name, color: tag.color })
    .from(tag)
    .where(eq(tag.clientId, clientId))
    .orderBy(tag.name);
}

/** Tags attachés à un brief précis (toutes ses entrées brief_tag). */
export async function listTagsForBrief(briefId: string) {
  const db = getDb();
  return db
    .select({ id: tag.id, name: tag.name, color: tag.color })
    .from(briefTag)
    .innerJoin(tag, eq(tag.id, briefTag.tagId))
    .where(eq(briefTag.briefId, briefId))
    .orderBy(tag.name);
}

/** Tags attachés en bulk pour une liste de briefs. */
export async function listTagsForBriefs(briefIds: string[]) {
  if (briefIds.length === 0) return new Map<string, { id: string; name: string; color: string }[]>();
  const db = getDb();
  const rows = await db
    .select({
      briefId: briefTag.briefId,
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })
    .from(briefTag)
    .innerJoin(tag, eq(tag.id, briefTag.tagId))
    .where(inArray(briefTag.briefId, briefIds));
  const map = new Map<string, { id: string; name: string; color: string }[]>();
  for (const r of rows) {
    const list = map.get(r.briefId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.briefId, list);
  }
  return map;
}

/**
 * Crée un tag dans le scope d'un client. Si un tag du même nom existe déjà
 * dans ce même scope, on le retourne tel quel (idempotent).
 */
export async function createTag(
  clientId: string,
  name: string,
  color: string,
  source: TagSource,
): Promise<
  | { ok: true; tag: { id: string; name: string; color: string; clientId: string; source: TagSource } }
  | { ok: false; error: string }
> {
  const cleanName = normalizeName(name);
  if (!cleanName) return { ok: false, error: "Le nom du tag est requis." };
  if (!(TAG_COLORS as readonly string[]).includes(color))
    return { ok: false, error: "Couleur de tag invalide." };

  const db = getDb();
  const [existing] = await db
    .select({ id: tag.id, name: tag.name, color: tag.color, clientId: tag.clientId, source: tag.source })
    .from(tag)
    .where(and(eq(tag.clientId, clientId), eq(tag.name, cleanName)))
    .limit(1);
  if (existing) {
    return {
      ok: true,
      tag: {
        id: existing.id,
        name: existing.name,
        color: existing.color,
        clientId: existing.clientId,
        source: existing.source as TagSource,
      },
    };
  }

  const id = randomUUID();
  await db.insert(tag).values({ id, clientId, name: cleanName, color, source });
  return { ok: true, tag: { id, clientId, name: cleanName, color, source } };
}

export async function attachTagToBrief(briefId: string, tagId: string) {
  // Garde-fou : on n'attache que des tags qui appartiennent au client du
  // brief, sinon on créerait des liens fantômes invisibles dans le picker.
  const db = getDb();
  const [match] = await db
    .select({ ok: tag.id })
    .from(brief)
    .innerJoin(tag, eq(tag.clientId, brief.clientId))
    .where(and(eq(brief.id, briefId), eq(tag.id, tagId)))
    .limit(1);
  if (!match) return { ok: false as const, error: "Tag hors du scope du brief" };
  await db.insert(briefTag).values({ briefId, tagId }).onConflictDoNothing();
  return { ok: true as const };
}

export async function detachTagFromBrief(briefId: string, tagId: string) {
  const db = getDb();
  await db
    .delete(briefTag)
    .where(and(eq(briefTag.briefId, briefId), eq(briefTag.tagId, tagId)));
}

/**
 * Détache tous les tags d'un brief. Utile quand on change le clientId d'un
 * brief : ses tags appartenaient à l'ancien client et ne doivent plus
 * apparaître côté nouveau client.
 */
export async function detachAllTagsFromBrief(briefId: string) {
  const db = getDb();
  await db.delete(briefTag).where(eq(briefTag.briefId, briefId));
}

/** Supprime un tag globalement (ses brief_tag partent en cascade). */
export async function deleteTagGlobally(tagId: string) {
  const db = getDb();
  await db.delete(tag).where(eq(tag.id, tagId));
}

/**
 * Vérifie qu'un tag existe et appartient à un client donné. Utilisé par les
 * endpoints share pour autoriser un client à manipuler uniquement ses tags.
 */
export async function isTagOfClient(tagId: string, clientId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.id, tagId), eq(tag.clientId, clientId)))
    .limit(1);
  return !!row;
}
