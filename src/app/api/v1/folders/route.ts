import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { resolveUser } from "@/lib/api-auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { folderShareUrl } from "@/lib/share-links";

export const dynamic = "force-dynamic";

/**
 * Listing des dossiers (clients) du workspace, pour retrouver l'id d'un
 * dossier avant d'appeler /api/v1/folders/{id}/share. Tous les dossiers
 * sont visibles par tous les consultants authentifiés, comme dans l'UI.
 *
 * Query params optionnels :
 *   - q     : filtre sur le nom (contains, insensible à la casse)
 *   - limit : défaut 100, max 500
 */
export async function GET(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));

  const rows = await getDb()
    .select({
      id: client.id,
      name: client.name,
      website: client.website,
      shareToken: client.shareToken,
      createdAt: client.createdAt,
    })
    .from(client)
    .orderBy(asc(client.name));

  const filtered = (q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows).slice(0, limit);

  return NextResponse.json({
    folders: filtered.map((r) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      shared: !!r.shareToken,
      shareUrl: r.shareToken ? folderShareUrl(req, r.shareToken) : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
