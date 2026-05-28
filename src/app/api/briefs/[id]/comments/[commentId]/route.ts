import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { user as userTable } from "@/db/schema";
import { deleteComment, updateComment } from "@/lib/comments";

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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await context.params;
  const me = await resolveSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    body?: string;
    resolved?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const res = await updateComment({
    commentId,
    briefId: id,
    body: body.body,
    resolved: body.resolved,
    resolverName: me.name,
    requireAuthor: { type: "user", id: me.id },
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ comment: res.comment });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await context.params;
  const me = await resolveSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = await deleteComment({
    commentId,
    briefId: id,
    requireAuthor: { type: "user", id: me.id },
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
