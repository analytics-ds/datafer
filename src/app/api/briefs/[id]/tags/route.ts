import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { attachTagToBrief, detachTagFromBrief } from "@/lib/tags-service";

export const dynamic = "force-dynamic";

async function assertAccess(briefId: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: brief.id })
    .from(brief)
    .where(eq(brief.id, briefId))
    .limit(1);
  return !!row;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { tagId?: string } | null;
  if (!body?.tagId) return NextResponse.json({ error: "bad body" }, { status: 400 });
  if (!(await assertAccess(id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const res = await attachTagToBrief(id, body.tagId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tagId = url.searchParams.get("tagId");
  if (!tagId) return NextResponse.json({ error: "bad query" }, { status: 400 });
  if (!(await assertAccess(id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  await detachTagFromBrief(id, tagId);
  return NextResponse.json({ ok: true });
}
