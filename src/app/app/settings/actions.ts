"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { apiKey, user } from "@/db/schema";
import { generateApiKey, newApiKeyId } from "@/lib/api-auth";

export async function updateProfileAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!firstName) return { ok: false, error: "Le prénom est requis" };
  if (!lastName) return { ok: false, error: "Le nom est requis" };
  if (!email || !/^.+@.+\..+$/.test(email))
    return { ok: false, error: "Email invalide" };

  const db = getDb();
  await db
    .update(user)
    .set({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
      updatedAt: new Date(),
    })
    .where(eq(user.id, session.user.id));

  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function changePasswordAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (newPassword.length < 6)
    return { ok: false, error: "Le nouveau mot de passe doit faire au moins 6 caractères" };
  if (newPassword !== confirm)
    return { ok: false, error: "Les deux mots de passe ne correspondent pas" };

  try {
    await getAuth().api.changePassword({
      headers: await headers(),
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
    });

    // Reset le flag de premier login si présent
    const db = getDb();
    await db
      .update(user)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));

    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return { ok: false, error: msg };
  }
}

export async function createApiKeyAction(formData: FormData): Promise<
  { ok: true; key: string; prefix: string; id: string } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const name = String(formData.get("name") ?? "").trim() || "Clé API";

  const { raw, prefix, hash } = await generateApiKey();
  const id = newApiKeyId();

  const db = getDb();
  await db.insert(apiKey).values({
    id,
    userId: session.user.id,
    name,
    keyHash: hash,
    prefix,
  });

  revalidatePath("/app/settings");
  return { ok: true, key: raw, prefix, id };
}

export async function revokeApiKeyAction(id: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const db = getDb();
  await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, id), eq(apiKey.userId, session.user.id), isNull(apiKey.revokedAt)));

  revalidatePath("/app/settings");
  return { ok: true };
}
