// GET   /api/v1/folders/[id]  — détail d'un dossier
// PATCH /api/v1/folders/[id]  — renomme / met à jour un dossier
//
// Pas de DELETE volontairement : supprimer un dossier détruit en cascade tous
// les briefs rattachés (onDelete: "cascade" sur brief.clientId). Ce geste reste
// derrière la confirmation retapée de l'UI (deleteFolderAction).

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { resolveUser } from "@/lib/api-auth";
import { nameTaken, normalizeUrl, serializeFolder, visibleTo } from "@/lib/folders-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [row] = await getDb()
    .select()
    .from(client)
    .where(and(eq(client.id, id), visibleTo(user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ folder: serializeFolder(row) });
}

/**
 * Body, tous les champs optionnels — seuls ceux présents sont écrits :
 *   { name?: string, website?: string|null, notes?: string|null,
 *     sitemapUrl?: string|null }
 */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    website?: string | null;
    notes?: string | null;
    sitemapUrl?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const db = getDb();
  const [row] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Workspace partagé : les dossiers "agency" sont éditables par tout user
  // authentifié, les "personal" par leur owner seul (même règle que
  // PATCH /api/clients/[id]).
  if (row.scope === "personal" && row.ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const patch: Partial<typeof client.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    if (name.length > 120) {
      return NextResponse.json({ error: "name must be 120 chars or less" }, { status: 400 });
    }
    if (await nameTaken(user.id, name, id)) {
      return NextResponse.json({ error: `a folder named "${name}" already exists` }, { status: 409 });
    }
    patch.name = name;
  }

  if (body.website !== undefined) {
    const website = normalizeUrl(body.website);
    if (website instanceof Error) {
      return NextResponse.json({ error: `website: ${website.message}` }, { status: 400 });
    }
    patch.website = website;
  }

  if (body.sitemapUrl !== undefined) {
    const sitemapUrl = normalizeUrl(body.sitemapUrl);
    if (sitemapUrl instanceof Error) {
      return NextResponse.json({ error: `sitemapUrl: ${sitemapUrl.message}` }, { status: 400 });
    }
    patch.sitemapUrl = sitemapUrl;
  }

  if (body.notes !== undefined) {
    patch.notes = body.notes === null ? null : String(body.notes).trim() || null;
  }

  await db.update(client).set(patch).where(eq(client.id, id));

  const [updated] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  return NextResponse.json({ folder: serializeFolder(updated) });
}
