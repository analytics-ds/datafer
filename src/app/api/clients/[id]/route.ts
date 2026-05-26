// PATCH /api/clients/[id]
// Met à jour les champs éditables d'un client. Pour l'instant : sitemapUrl
// (config maillage interne). Restera étendu si d'autres champs deviennent
// éditables depuis l'UI.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    sitemapUrl?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const db = getDb();
  const [row] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Workspace partagé : tout user authentifié peut éditer les clients agency.
  // Pour les clients personal, seul l'owner.
  if (row.scope === "personal" && row.ownerId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const patch: { sitemapUrl?: string | null; updatedAt: Date } = { updatedAt: new Date() };

  if (body.sitemapUrl !== undefined) {
    if (body.sitemapUrl === null || body.sitemapUrl === "") {
      patch.sitemapUrl = null;
    } else {
      try {
        const u = new URL(body.sitemapUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return NextResponse.json({ error: "sitemap URL must be http(s)" }, { status: 400 });
        }
        patch.sitemapUrl = u.href;
      } catch {
        return NextResponse.json({ error: "invalid sitemap URL" }, { status: 400 });
      }
    }
  }

  await db.update(client).set(patch).where(eq(client.id, id));
  return NextResponse.json({ ok: true });
}
