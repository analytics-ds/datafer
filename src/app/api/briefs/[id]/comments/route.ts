import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, user as userTable } from "@/db/schema";
import { createComment, listCommentsForBrief } from "@/lib/comments";

export const dynamic = "force-dynamic";

async function resolveSessionUser(): Promise<{ id: string; name: string } | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const db = getDb();
  const [row] = await db
    .select({ firstName: userTable.firstName, name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);
  const display =
    (row?.firstName?.trim() || row?.name?.trim() || row?.email?.split("@")[0] || "Consultant") ?? "Consultant";
  return { id: session.user.id, name: display };
}

async function briefExists(id: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ id: brief.id }).from(brief).where(eq(brief.id, id)).limit(1);
  return !!row;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const me = await resolveSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await briefExists(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const comments = await listCommentsForBrief(id);
  return NextResponse.json({ comments });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const me = await resolveSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    anchorId?: string;
    anchorText?: string;
    body?: string;
    parentId?: string | null;
  } | null;
  if (!body?.anchorId || !body?.anchorText || !body?.body) {
    return NextResponse.json({ error: "anchorId, anchorText, body required" }, { status: 400 });
  }

  const res = await createComment({
    briefId: id,
    anchorId: body.anchorId,
    anchorText: body.anchorText,
    body: body.body,
    parentId: body.parentId ?? null,
    author: { type: "user", id: me.id, name: me.name },
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ comment: res.comment });
}
