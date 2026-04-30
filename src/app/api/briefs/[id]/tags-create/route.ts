import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { createTag, TAG_COLORS } from "@/lib/tags-service";

export const dynamic = "force-dynamic";

/**
 * Crée un tag dans le scope du client du brief courant. Le clientId est
 * lu côté serveur à partir du brief : l'appelant ne peut pas le forger.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string; color?: string } | null;
  if (!body?.name || !body?.color)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  if (!(TAG_COLORS as readonly string[]).includes(body.color))
    return NextResponse.json({ error: "bad color" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({ clientId: brief.clientId })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!row.clientId)
    return NextResponse.json(
      { error: "Rattache le brief à un client pour créer des tags." },
      { status: 400 },
    );

  const res = await createTag(row.clientId, body.name, body.color, "agency");
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({
    tag: { id: res.tag.id, name: res.tag.name, color: res.tag.color },
  });
}
