// GET  /api/v1/folders  — liste les dossiers (clients) visibles
// POST /api/v1/folders  — crée un dossier
//
// Un dossier est une row `client` : le libellé produit est « client » dans
// l'UI, « folder » dans l'API (même vocabulaire que le `folderId` des briefs).
// Créés via l'API, les dossiers sont en scope "agency" comme ceux créés depuis
// l'UI (cf. createFolderAction) : toute l'agence les voit.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { resolveUser } from "@/lib/api-auth";
import { normalizeUrl, serializeFolder, visibleTo } from "@/lib/folders-service";

export const dynamic = "force-dynamic";

/**
 * Query params (optionnels) :
 *   - name  : filtre exact insensible à la casse (anti-doublon avant POST)
 *   - q     : recherche partielle insensible à la casse sur le nom
 *   - limit : défaut 100, max 500
 */
export async function GET(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));

  const conditions = [visibleTo(user.id)];
  if (name) conditions.push(sql`lower(${client.name}) = ${name.toLowerCase()}`);
  if (q) conditions.push(sql`lower(${client.name}) LIKE ${`%${q.toLowerCase()}%`}`);

  const rows = await getDb()
    .select()
    .from(client)
    .where(and(...conditions))
    .orderBy(asc(client.name))
    .limit(limit);

  return NextResponse.json({ folders: rows.map(serializeFolder) });
}

/**
 * Body : { name: string, website?: string|null, notes?: string|null,
 *          sitemapUrl?: string|null, scope?: "agency"|"personal" }
 *
 * Anti-doublon : si un dossier visible porte déjà ce nom (à la casse près),
 * il est renvoyé tel quel avec `created: false` en HTTP 200. Le POST est donc
 * idempotent sur le nom, ce qui rend un script appelant rejouable sans créer
 * de doublon — même logique que le dedupe des briefs.
 */
export async function POST(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    website?: string | null;
    notes?: string | null;
    sitemapUrl?: string | null;
    scope?: string;
  } | null;

  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 120) {
    return NextResponse.json({ error: "name must be 120 chars or less" }, { status: 400 });
  }

  const scope = body?.scope ?? "agency";
  if (scope !== "agency" && scope !== "personal") {
    return NextResponse.json({ error: "scope must be agency or personal" }, { status: 400 });
  }

  const website = normalizeUrl(body?.website);
  if (website instanceof Error) {
    return NextResponse.json({ error: `website: ${website.message}` }, { status: 400 });
  }
  const sitemapUrl = normalizeUrl(body?.sitemapUrl);
  if (sitemapUrl instanceof Error) {
    return NextResponse.json({ error: `sitemapUrl: ${sitemapUrl.message}` }, { status: 400 });
  }

  const db = getDb();

  const [existing] = await db
    .select()
    .from(client)
    .where(and(visibleTo(user.id), sql`lower(${client.name}) = ${name.toLowerCase()}`))
    .limit(1);
  if (existing) {
    return NextResponse.json({ folder: serializeFolder(existing), created: false });
  }

  const id = randomUUID();
  await db.insert(client).values({
    id,
    ownerId: user.id,
    scope,
    name,
    website,
    notes: body?.notes?.trim() || null,
    sitemapUrl,
  });

  const [created] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  return NextResponse.json({ folder: serializeFolder(created), created: true }, { status: 201 });
}
