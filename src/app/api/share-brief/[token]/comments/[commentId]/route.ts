import { NextResponse } from "next/server";
import { deleteComment, resolveBriefByShareToken, updateComment } from "@/lib/comments";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ token: string; commentId: string }> },
) {
  const { token, commentId } = await context.params;
  const briefId = await resolveBriefByShareToken(token);
  if (!briefId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    body?: string;
    resolved?: boolean;
    /** Nom utilisé pour vérifier l'auteur côté client + résolution. */
    authorName?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const name = (body.authorName ?? "").trim();
  if (!name) return NextResponse.json({ error: "authorName required" }, { status: 400 });

  const res = await updateComment({
    commentId,
    briefId,
    body: body.body,
    resolved: body.resolved,
    resolverName: name,
    requireAuthor: { type: "client", name },
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ comment: res.comment });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ token: string; commentId: string }> },
) {
  const { token, commentId } = await context.params;
  const briefId = await resolveBriefByShareToken(token);
  if (!briefId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { authorName?: string } | null;
  const name = (body?.authorName ?? "").trim();
  if (!name) return NextResponse.json({ error: "authorName required" }, { status: 400 });

  const res = await deleteComment({
    commentId,
    briefId,
    requireAuthor: { type: "client", name },
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
