import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { attachTagToBrief, detachTagFromBrief } from "@/lib/tags-service";

export const dynamic = "force-dynamic";

async function resolveBriefId(token: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: brief.id })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);
  return row?.id ?? null;
}

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = (await req.json().catch(() => null)) as { tagId?: string } | null;
  if (!body?.tagId) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const id = await resolveBriefId(token);
  if (!id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const res = await attachTagToBrief(id, body.tagId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(req.url);
  const tagId = url.searchParams.get("tagId");
  if (!tagId) return NextResponse.json({ error: "bad query" }, { status: 400 });

  const id = await resolveBriefId(token);
  if (!id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await detachTagFromBrief(id, tagId);
  return NextResponse.json({ ok: true });
}
