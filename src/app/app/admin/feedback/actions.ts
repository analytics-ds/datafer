"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getAuth } from "@/lib/auth";
import type { DataferEnv } from "@/lib/datafer-env";

const ADMIN_EMAIL = "pierre@datashake.fr";

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: "unauthorized" };
  if (session.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true };
}

function getDb() {
  const { env } = getCloudflareContext();
  return drizzle((env as DataferEnv).DB, { schema });
}

export async function updateFeedbackStatus(
  id: string,
  status: "new" | "in_progress" | "resolved",
  resolvedNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin();
  if (!auth.ok) return { ok: false, error: auth.reason };

  const db = getDb();
  await db
    .update(schema.feedback)
    .set({
      status,
      resolvedAt: status === "resolved" ? new Date() : null,
      resolvedNote: status === "resolved" ? (resolvedNote ?? null) : null,
    })
    .where(eq(schema.feedback.id, id));

  revalidatePath("/app/admin/feedback");
  return { ok: true };
}

export async function deleteFeedback(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin();
  if (!auth.ok) return { ok: false, error: auth.reason };

  const db = getDb();
  await db.delete(schema.feedback).where(eq(schema.feedback.id, id));
  revalidatePath("/app/admin/feedback");
  return { ok: true };
}
