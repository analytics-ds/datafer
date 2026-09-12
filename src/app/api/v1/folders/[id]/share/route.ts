import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resolveUser } from "@/lib/api-auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { folderShareUrl, generateShareToken } from "@/lib/share-links";

export const dynamic = "force-dynamic";

/**
 * Lien de partage public d'un dossier (= client), celui qu'on envoie au
 * client final. Équivalent API des boutons du SharePanel de l'UI.
 *
 *   GET    -> état actuel du partage (shared, token, url)
 *   POST   -> active le partage, ou renvoie le lien existant.
 *             `{"regenerate": true}` force un nouveau token (invalide l'ancien).
 *   DELETE -> révoque le lien.
 *
 * Le token n'expire jamais, seule la révocation le tue.
 */
async function loadFolder(id: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: client.id, name: client.name, shareToken: client.shareToken })
    .from(client)
    .where(eq(client.id, id))
    .limit(1);
  return row ?? null;
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const folder = await loadFolder(id);
  if (!folder) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    folderId: folder.id,
    name: folder.name,
    shared: !!folder.shareToken,
    token: folder.shareToken ?? null,
    url: folder.shareToken ? folderShareUrl(req, folder.shareToken) : null,
  });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { regenerate?: boolean } | null;

  const folder = await loadFolder(id);
  if (!folder) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Idempotent : si le dossier est déjà partagé on renvoie le même lien,
  // pour ne pas casser un lien déjà envoyé à un client.
  if (folder.shareToken && !body?.regenerate) {
    return NextResponse.json({
      folderId: folder.id,
      name: folder.name,
      shared: true,
      created: false,
      token: folder.shareToken,
      url: folderShareUrl(req, folder.shareToken),
    });
  }

  const token = generateShareToken();
  await getDb()
    .update(client)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(client.id, id));

  return NextResponse.json({
    folderId: folder.id,
    name: folder.name,
    shared: true,
    created: true,
    token,
    url: folderShareUrl(req, token),
  });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const folder = await loadFolder(id);
  if (!folder) return NextResponse.json({ error: "not found" }, { status: 404 });

  await getDb()
    .update(client)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(eq(client.id, id));

  return NextResponse.json({ folderId: folder.id, shared: false, revoked: !!folder.shareToken });
}
