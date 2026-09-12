import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resolveUser } from "@/lib/api-auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { briefShareUrl, generateShareToken } from "@/lib/share-links";

export const dynamic = "force-dynamic";

/**
 * Lien de partage public d'un brief seul (vue /share-brief/<token>).
 * Même contrat que /api/v1/folders/{id}/share :
 *
 *   GET    -> état du partage
 *   POST   -> active le partage (idempotent, `{"regenerate": true}` pour
 *             changer de token et invalider l'ancien lien)
 *   DELETE -> révoque
 */
async function loadBrief(id: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: brief.id, keyword: brief.keyword, shareToken: brief.shareToken })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);
  return row ?? null;
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await loadBrief(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    briefId: row.id,
    keyword: row.keyword,
    shared: !!row.shareToken,
    token: row.shareToken ?? null,
    url: row.shareToken ? briefShareUrl(req, row.shareToken) : null,
  });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { regenerate?: boolean } | null;

  const row = await loadBrief(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (row.shareToken && !body?.regenerate) {
    return NextResponse.json({
      briefId: row.id,
      keyword: row.keyword,
      shared: true,
      created: false,
      token: row.shareToken,
      url: briefShareUrl(req, row.shareToken),
    });
  }

  const token = generateShareToken();
  await getDb()
    .update(brief)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(brief.id, id));

  return NextResponse.json({
    briefId: row.id,
    keyword: row.keyword,
    shared: true,
    created: true,
    token,
    url: briefShareUrl(req, token),
  });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await loadBrief(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  await getDb()
    .update(brief)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(eq(brief.id, id));

  return NextResponse.json({ briefId: row.id, shared: false, revoked: !!row.shareToken });
}
