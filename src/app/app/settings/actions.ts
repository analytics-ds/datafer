"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function updateProfileAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const image = String(formData.get("image") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Le nom est requis" };
  if (!email || !/^.+@.+\..+$/.test(email))
    return { ok: false, error: "Email invalide" };

  const db = getDb();
  await db
    .update(user)
    .set({ name, email, image, updatedAt: new Date() })
    .where(eq(user.id, session.user.id));

  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function changePasswordAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
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
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return { ok: false, error: msg };
  }
}
