"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";

async function assertAccess(briefId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: brief.id })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(
      and(
        eq(brief.id, briefId),
        or(eq(brief.ownerId, userId), eq(client.scope, "agency")),
      ),
    )
    .limit(1);
  return !!row;
}

export async function enableBriefShareAction(briefId: string): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(await assertAccess(briefId, session.user.id)))
    return { ok: false, error: "Brief introuvable" };

  const token = randomBytes(24).toString("base64url");
  const db = getDb();
  await db.update(brief).set({ shareToken: token, updatedAt: new Date() }).where(eq(brief.id, briefId));
  revalidatePath(`/app/briefs/${briefId}`);
  return { ok: true, token };
}

export async function revokeBriefShareAction(briefId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(await assertAccess(briefId, session.user.id)))
    return { ok: false, error: "Brief introuvable" };

  const db = getDb();
  await db.update(brief).set({ shareToken: null, updatedAt: new Date() }).where(eq(brief.id, briefId));
  revalidatePath(`/app/briefs/${briefId}`);
  return { ok: true };
}

export async function deleteBriefAction(briefId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(await assertAccess(briefId, session.user.id)))
    return { ok: false, error: "Brief introuvable" };

  const db = getDb();
  await db.delete(brief).where(eq(brief.id, briefId));
  revalidatePath("/app/briefs");
  redirect("/app/briefs");
}
