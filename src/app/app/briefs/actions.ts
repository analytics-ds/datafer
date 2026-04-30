"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import {
  attachTagToBrief,
  createTag,
  deleteTagGlobally,
  detachTagFromBrief,
  TAG_COLORS,
} from "@/lib/tags-service";

const WORKFLOW_STATUSES = ["in_progress", "drafted", "published"] as const;
type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

// Workspace partagé : tout user authentifié peut voir et modifier
// n'importe quel brief, peu importe l'auteur.
async function assertAccess(briefId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: brief.id })
    .from(brief)
    .where(eq(brief.id, briefId))
    .limit(1);
  return !!row;
}

export async function enableBriefShareAction(briefId: string): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(await assertAccess(briefId)))
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
  if (!(await assertAccess(briefId)))
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
  if (!(await assertAccess(briefId)))
    return { ok: false, error: "Brief introuvable" };

  const db = getDb();
  await db.delete(brief).where(eq(brief.id, briefId));
  revalidatePath("/app/briefs");
  revalidatePath("/app");
  return { ok: true };
}

// ─── Statut éditorial ──────────────────────────────────────────────────────

export async function updateWorkflowStatusAction(
  briefId: string,
  status: WorkflowStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!WORKFLOW_STATUSES.includes(status))
    return { ok: false, error: "Statut invalide" };
  if (!(await assertAccess(briefId)))
    return { ok: false, error: "Brief introuvable" };

  const db = getDb();
  await db
    .update(brief)
    .set({ workflowStatus: status, updatedAt: new Date() })
    .where(eq(brief.id, briefId));
  revalidatePath("/app/briefs");
  revalidatePath(`/app/briefs/${briefId}`);
  return { ok: true };
}

// ─── Tags ──────────────────────────────────────────────────────────────────

/**
 * Récupère le clientId d'un brief. Retourne null si le brief n'existe pas
 * ou n'est pas rattaché à un client (auquel cas il ne peut pas avoir de tags).
 */
async function getBriefClientId(briefId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ clientId: brief.clientId })
    .from(brief)
    .where(eq(brief.id, briefId))
    .limit(1);
  return row?.clientId ?? null;
}

/**
 * Création d'un tag dans le scope du brief courant. Le clientId est lu en
 * BDD : on évite ainsi qu'un appelant choisisse arbitrairement le scope.
 */
export async function createTagAction(
  briefId: string,
  name: string,
  color: string,
): Promise<{ ok: true; tag: { id: string; name: string; color: string } } | { ok: false; error: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(TAG_COLORS as readonly string[]).includes(color))
    return { ok: false, error: "Couleur invalide" };

  const clientId = await getBriefClientId(briefId);
  if (!clientId)
    return { ok: false, error: "Rattache le brief à un client pour créer des tags." };

  const res = await createTag(clientId, name, color, "agency");
  if (!res.ok) return res;
  revalidatePath("/app/briefs");
  revalidatePath(`/app/folders/${clientId}`);
  return { ok: true, tag: { id: res.tag.id, name: res.tag.name, color: res.tag.color } };
}

export async function deleteTagAction(
  tagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  await deleteTagGlobally(tagId);
  revalidatePath("/app/briefs");
  revalidatePath("/app/folders");
  return { ok: true };
}

export async function attachTagAction(
  briefId: string,
  tagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(await assertAccess(briefId)))
    return { ok: false, error: "Brief introuvable" };
  const res = await attachTagToBrief(briefId, tagId);
  if (!res.ok) return res;
  revalidatePath("/app/briefs");
  revalidatePath(`/app/briefs/${briefId}`);
  return { ok: true };
}

export async function detachTagAction(
  briefId: string,
  tagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Non authentifié" };
  if (!(await assertAccess(briefId)))
    return { ok: false, error: "Brief introuvable" };
  await detachTagFromBrief(briefId, tagId);
  revalidatePath("/app/briefs");
  revalidatePath(`/app/briefs/${briefId}`);
  return { ok: true };
}
