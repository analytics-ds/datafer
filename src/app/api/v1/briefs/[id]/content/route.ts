import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/api-auth";
import { rescoreBrief } from "@/lib/briefs-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { editorHtml?: string; html?: string } | null;
  const html = body?.editorHtml ?? body?.html;
  if (typeof html !== "string") {
    return NextResponse.json({ error: "editorHtml required" }, { status: 400 });
  }

  const res = await rescoreBrief(id, html);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  return NextResponse.json({
    id,
    score: res.total,
    breakdown: res.breakdown,
    competitors: res.competitors,
  });
}
