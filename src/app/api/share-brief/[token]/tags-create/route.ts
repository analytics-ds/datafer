import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { createTag, TAG_COLORS } from "@/lib/tags-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = (await req.json().catch(() => null)) as { name?: string; color?: string } | null;
  if (!body?.name || !body?.color)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  if (!(TAG_COLORS as readonly string[]).includes(body.color))
    return NextResponse.json({ error: "bad color" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({ id: brief.id })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);
  if (!row) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const res = await createTag(body.name, body.color, "client");
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ tag: res.tag });
}
