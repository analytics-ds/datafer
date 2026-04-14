import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, or } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    editorHtml?: string;
    score?: number;
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const db = getDb();

  // Vérifier l'accès : owner OU brief rattaché à un dossier agence
  const [row] = await db
    .select({ id: brief.id })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(
      and(
        eq(brief.id, id),
        or(eq(brief.ownerId, session.user.id), eq(client.scope, "agency")),
      ),
    )
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db
    .update(brief)
    .set({
      editorHtml: body.editorHtml ?? "",
      score: body.score ?? null,
      updatedAt: new Date(),
    })
    .where(eq(brief.id, id));

  return NextResponse.json({ ok: true });
}
