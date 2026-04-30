"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { createTag, deleteTagGlobally, TAG_COLORS } from "@/lib/tags-service";

/**
 * Création d'un tag depuis la fiche dossier (le clientId est explicite,
 * choisi côté UI). Symétrique à `createTagAction` qui passe par briefId.
 */
export async function createFolderTagAction(
  folderId: string,
  name: string,
  color: string,
): Promise<
  { ok: true; tag: { id: string; name: string; color: string } } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(TAG_COLORS as readonly string[]).includes(color))
    return { ok: false, error: "Couleur invalide" };

  const res = await createTag(folderId, name, color, "agency");
  if (!res.ok) return res;
  revalidatePath(`/app/folders/${folderId}`);
  revalidatePath("/app/briefs");
  return { ok: true, tag: { id: res.tag.id, name: res.tag.name, color: res.tag.color } };
}

export async function deleteTagAction(
  tagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  await deleteTagGlobally(tagId);
  revalidatePath("/app/folders");
  revalidatePath("/app/briefs");
  return { ok: true };
}
