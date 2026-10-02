import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { resolveUser } from "@/lib/api-auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { folderShareUrl } from "@/lib/share-links";
import { findMatchingFolder } from "@/lib/folders-service";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/types";

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
      scope: client.scope,
      shareToken: client.shareToken,
      createdAt: client.createdAt,
    })
    .from(client)
    .orderBy(asc(client.name));

  const filtered = (q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows).slice(0, limit);

  return NextResponse.json({
    folders: filtered.map((r) => folderJson(req, r)),
  });
}

type FolderRow = {
  id: string;
  name: string;
  website: string | null;
  scope: "personal" | "agency";
  shareToken: string | null;
  createdAt: Date;
};

function folderJson(req: Request, r: FolderRow) {
  return {
    id: r.id,
    name: r.name,
    website: r.website,
    // "agency" = dossier de l'agence, "personal" = dossier personnel de son
    // propriétaire : un outil tiers ne le présente pas comme un client.
    scope: r.scope,
    shared: !!r.shareToken,
    shareUrl: r.shareToken ? folderShareUrl(req, r.shareToken) : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Création d'un dossier (client) par l'API, même effet que le bouton
 * « Nouveau dossier » de l'UI : dossier de scope agence, visible de tous.
 *
 * Corps JSON : { name (requis), website?, locale? ("fr" | "en") }
 *
 * Idempotent par client : si un dossier désigne déjà la même entreprise
 * (même domaine, ou même nom quand l'un des deux n'a pas de site), il est
 * renvoyé tel quel avec `duplicate: true` et rien n'est créé. Un outil qui
 * synchronise ses clients avec corpus (Cluster Map) peut donc appeler cette
 * route sans vérifier d'abord, et sans jamais dédoublonner à la main.
 */
export async function POST(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    website?: string | null;
    locale?: string;
  } | null;
  const name = String(body?.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "name too long (120 max)" }, { status: 400 });
  const website = String(body?.website ?? "").trim() || null;
  if (website && website.length > 300) {
    return NextResponse.json({ error: "website too long (300 max)" }, { status: 400 });
  }
  const locale = isLocale(String(body?.locale ?? "")) ? (body!.locale as "fr" | "en") : DEFAULT_LOCALE;

  const db = getDb();
  const rows = await db
    .select({
      id: client.id,
      name: client.name,
      website: client.website,
      scope: client.scope,
      shareToken: client.shareToken,
      createdAt: client.createdAt,
    })
    .from(client);

  const existing = findMatchingFolder(rows, { name, website });
  if (existing) {
    return NextResponse.json({ folder: folderJson(req, existing), duplicate: true });
  }

  const id = crypto.randomUUID();
  await db.insert(client).values({
    id,
    ownerId: user.id,
    // Comme dans l'UI : tous les dossiers sont partagés à l'échelle de l'agence
    scope: "agency",
    name,
    website,
    locale,
  });
  const [created] = await db
    .select({
      id: client.id,
      name: client.name,
      website: client.website,
      scope: client.scope,
      shareToken: client.shareToken,
      createdAt: client.createdAt,
    })
    .from(client)
    .where(eq(client.id, id))
    .limit(1);

  return NextResponse.json({ folder: folderJson(req, created), duplicate: false }, { status: 201 });
}
