import { NextResponse } from "next/server";
import { createComment, listCommentsForBrief, resolveBriefByShareToken } from "@/lib/comments";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const briefId = await resolveBriefByShareToken(token);
  if (!briefId) return NextResponse.json({ error: "not found" }, { status: 404 });
  const comments = await listCommentsForBrief(briefId);
  return NextResponse.json({ comments });
}

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const briefId = await resolveBriefByShareToken(token);
  if (!briefId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    anchorId?: string;
    anchorText?: string;
    body?: string;
    parentId?: string | null;
    authorName?: string;
  } | null;
  if (!body?.anchorId || !body?.anchorText || !body?.body || !body?.authorName) {
    return NextResponse.json(
      { error: "anchorId, anchorText, body, authorName required" },
      { status: 400 },
    );
  }

  const res = await createComment({
    briefId,
    anchorId: body.anchorId,
    anchorText: body.anchorText,
    body: body.body,
    parentId: body.parentId ?? null,
    author: { type: "client", name: body.authorName },
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ comment: res.comment });
}
