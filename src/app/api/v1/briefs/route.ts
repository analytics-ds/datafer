import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client, user as userTable } from "@/db/schema";
import { resolveUser } from "@/lib/api-auth";
import { createPendingBrief } from "@/lib/briefs-service";
import type { CorpusEnv } from "@/lib/corpus-env";

export const dynamic = "force-dynamic";

/**
 * Listing des briefs du user authentifié, du plus récent au plus ancien.
 * Permet à un client API de vérifier si un brief existe déjà pour un mot-clé
 * AVANT d'en créer un (anti-doublon), ou de retrouver l'id d'un brief dont la
 * réponse du POST s'est perdue (timeout réseau).
 *
 * Query params (tous optionnels) :
 *   - keyword  : filtre exact insensible à la casse
 *   - folderId : filtre par dossier
 *   - scope    : "folder" (avec folderId) = TOUS les briefs du dossier, quel que
 *                soit leur auteur, comme la page dossier de l'UI. Sans ce
 *                paramètre, seulement ceux du propriétaire de la clé (inchangé).
 *                Refusé sur le dossier personnel d'un autre utilisateur.
 *   - status   : pending | ready | failed
 *   - limit    : nombre max de résultats (défaut 20, max 100)
 *   - offset   : pagination, à reprendre de `nextOffset` (null = dernière page)
 */
export async function GET(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  const folderId = url.searchParams.get("folderId")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0));
  const scope = url.searchParams.get("scope")?.trim();

  if (status && !["pending", "ready", "failed"].includes(status)) {
    return NextResponse.json({ error: "status must be pending, ready or failed" }, { status: 400 });
  }
  if (scope && scope !== "folder") {
    return NextResponse.json({ error: "scope must be folder" }, { status: 400 });
  }
  if (scope === "folder" && !folderId) {
    return NextResponse.json({ error: "scope=folder requires folderId" }, { status: 400 });
  }

  // scope=folder : le dossier doit être visible de l'appelant, exactement comme
  // dans l'UI (dossier d'agence, ou dossier personnel dont il est le propriétaire).
  if (scope === "folder") {
    const [folder] = await getDb()
      .select({ id: client.id, scope: client.scope, ownerId: client.ownerId })
      .from(client)
      .where(eq(client.id, folderId!))
      .limit(1);
    if (!folder || (folder.scope === "personal" && folder.ownerId !== user.id)) {
      return NextResponse.json({ error: "folder not found" }, { status: 404 });
    }
  }

  const conditions = scope === "folder" ? [] : [eq(brief.ownerId, user.id)];
  if (keyword) conditions.push(sql`lower(${brief.keyword}) = ${keyword.toLowerCase()}`);
  if (folderId) conditions.push(eq(brief.clientId, folderId));
  if (status) conditions.push(eq(brief.status, status as "pending" | "ready" | "failed"));

  const rows = await getDb()
    .select({
      id: brief.id,
      keyword: brief.keyword,
      country: brief.country,
      status: brief.status,
      workflowStatus: brief.workflowStatus,
      score: brief.score,
      folderId: brief.clientId,
      ownerEmail: userTable.email,
      createdAt: brief.createdAt,
      updatedAt: brief.updatedAt,
    })
    .from(brief)
    .leftJoin(userTable, eq(userTable.id, brief.ownerId))
    .where(and(...conditions))
    .orderBy(desc(brief.createdAt), desc(brief.id))
    // Une ligne de plus que demandé : c'est elle qui dit s'il reste une page.
    .limit(limit + 1)
    .offset(offset);

  const page = rows.slice(0, limit);
  return NextResponse.json({
    briefs: page.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    nextOffset: rows.length > limit ? offset + limit : null,
  });
}

export async function POST(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    keyword?: string;
    secondaryKeywords?: string[];
    country?: string;
    folderId?: string;
    myUrl?: string;
  } | null;
  if (!body?.keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const input = {
    keyword: body.keyword,
    secondaryKeywords: body.secondaryKeywords,
    country: body.country,
    folderId: body.folderId,
    myUrl: body.myUrl,
  };

  const created = await createPendingBrief(user.id, input, { dedupe: true });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

  // Doublon détecté (même keyword + pays + dossier, pending ou ready < 10 min) :
  // on renvoie l'id existant SANS relancer d'analyse. Un client qui retry après
  // un timeout/erreur récupère ainsi le brief déjà lancé au lieu d'en empiler
  // un deuxième. duplicate: true permet au client de le savoir.
  if (created.duplicate) {
    return NextResponse.json({
      id: created.id,
      status: created.duplicateStatus,
      duplicate: true,
      keyword: input.keyword.trim(),
      country: (input.country || "fr").toLowerCase(),
      folderId: input.folderId ?? null,
      message:
        created.duplicateStatus === "pending"
          ? "un brief identique est déjà en cours d'analyse, interroger GET /api/v1/briefs/{id}"
          : "un brief identique a été créé il y a moins de 10 minutes, réutilisation de l'existant",
    });
  }

  const env = getCloudflareContext().env as unknown as CorpusEnv;
  if (!env.ANALYSIS_QUEUE) {
    return NextResponse.json(
      { error: "ANALYSIS_QUEUE binding missing" },
      { status: 500 },
    );
  }
  await env.ANALYSIS_QUEUE.send({
    briefId: created.id,
    userId: user.id,
    input,
  });

  // Renvoie keyword/country/folderId dans la réponse pour que les clients
  // qui POST en parallèle (ex : `&` shell, Promise.all) puissent mapper chaque
  // réponse à sa requête sans avoir à enchaîner un GET V2. Sans ça, l'ordre
  // des réponses n'est pas garanti et le mapping ID → keyword peut être faux.
  return NextResponse.json({
    id: created.id,
    status: "pending",
    keyword: input.keyword,
    country: (input.country || "fr").toLowerCase(),
    folderId: input.folderId ?? null,
    message: "brief en cours d'analyse, interroger GET /api/v1/briefs/{id}",
  });
}
