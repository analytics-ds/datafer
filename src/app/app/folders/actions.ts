"use server";

import { randomUUID, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client, folderFavorite } from "@/db/schema";

export async function createFolderAction(formData: FormData) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) throw new Error("Non authentifié");

  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim() || null;

  if (!name) throw new Error("Nom requis");

  const id = randomUUID();
  const db = getDb();
  await db.insert(client).values({
    id,
    ownerId: session.user.id,
    // Tous les dossiers sont partagés à l'échelle de l'agence
    scope: "agency",
    name,
    website,
  });

  redirect(`/app/folders/${id}`);
}

export async function toggleFavoriteAction(folderId: string): Promise<
  { ok: true; favorited: boolean } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(folderFavorite)
    .where(and(eq(folderFavorite.userId, session.user.id), eq(folderFavorite.folderId, folderId)))
    .limit(1);

  if (existing) {
    await db
      .delete(folderFavorite)
      .where(and(eq(folderFavorite.userId, session.user.id), eq(folderFavorite.folderId, folderId)));
    revalidatePath("/app", "layout");
    return { ok: true, favorited: false };
  }

  await db.insert(folderFavorite).values({
    userId: session.user.id,
    folderId,
  });
  revalidatePath("/app", "layout");
  return { ok: true, favorited: true };
}

export async function enableShareAction(folderId: string): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const token = randomBytes(24).toString("base64url");
  const db = getDb();
  await db
    .update(client)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(client.id, folderId));

  revalidatePath(`/app/folders/${folderId}`);
  return { ok: true, token };
}

export async function revokeShareAction(folderId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const db = getDb();
  await db
    .update(client)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(eq(client.id, folderId));

  revalidatePath(`/app/folders/${folderId}`);
  return { ok: true };
}

export async function deleteFolderAction(
  folderId: string,
  confirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const db = getDb();
  const [folder] = await db
    .select({ name: client.name, website: client.website })
    .from(client)
    .where(eq(client.id, folderId))
    .limit(1);

  if (!folder) return { ok: false, error: "Dossier introuvable" };

  // Confirmation : le consultant doit retaper le site (ou à défaut le nom du
  // dossier s'il n'a pas de site).
  const expected = (folder.website ?? folder.name).trim();
  if (confirmation.trim() !== expected) {
    return { ok: false, error: `Merci de retaper "${expected}" pour confirmer` };
  }

  await db.delete(client).where(eq(client.id, folderId));
  revalidatePath("/app", "layout");
  redirect("/app/folders");
}
