"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";

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
