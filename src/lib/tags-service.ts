import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { briefTag, tag } from "@/db/schema";

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

export async function listAllTags() {
  const db = getDb();
  return db
    .select({ id: tag.id, name: tag.name, color: tag.color, source: tag.source })
    .from(tag)
    .orderBy(tag.name);
}

export async function listTagsForBrief(briefId: string) {
  const db = getDb();
  return db
    .select({ id: tag.id, name: tag.name, color: tag.color })
    .from(briefTag)
    .innerJoin(tag, eq(tag.id, briefTag.tagId))
    .where(eq(briefTag.briefId, briefId))
    .orderBy(tag.name);
}

export async function listTagsForBriefs(briefIds: string[]) {
  if (briefIds.length === 0) return new Map<string, { id: string; name: string; color: string }[]>();
  const db = getDb();
  // SQLite IN clause via Drizzle
  const { inArray } = await import("drizzle-orm");
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

export async function createTag(name: string, color: string, source: TagSource): Promise<
  { ok: true; tag: { id: string; name: string; color: string; source: TagSource } } | { ok: false; error: string }
> {
  const cleanName = normalizeName(name);
  if (!cleanName) return { ok: false, error: "Le nom du tag est requis." };
  if (!(TAG_COLORS as readonly string[]).includes(color))
    return { ok: false, error: "Couleur de tag invalide." };

  const db = getDb();
  const [existing] = await db
    .select({ id: tag.id, name: tag.name, color: tag.color, source: tag.source })
    .from(tag)
    .where(eq(tag.name, cleanName))
    .limit(1);
  if (existing) {
    return {
      ok: true,
      tag: { id: existing.id, name: existing.name, color: existing.color, source: existing.source as TagSource },
    };
  }

  const id = randomUUID();
  await db.insert(tag).values({ id, name: cleanName, color, source });
  return { ok: true, tag: { id, name: cleanName, color, source } };
}

export async function attachTagToBrief(briefId: string, tagId: string) {
  const db = getDb();
  // ON CONFLICT DO NOTHING : la PK composite garantit l'unicité.
  await db.insert(briefTag).values({ briefId, tagId }).onConflictDoNothing();
}

export async function detachTagFromBrief(briefId: string, tagId: string) {
  const db = getDb();
  await db
    .delete(briefTag)
    .where(and(eq(briefTag.briefId, briefId), eq(briefTag.tagId, tagId)));
}

export async function deleteTagGlobally(tagId: string) {
  const db = getDb();
  // brief_tag est en ON DELETE CASCADE → les liens partent automatiquement.
  await db.delete(tag).where(eq(tag.id, tagId));
}
