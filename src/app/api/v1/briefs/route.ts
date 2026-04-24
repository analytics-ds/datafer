import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/api-auth";
import { createBrief } from "@/lib/briefs-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    keyword?: string;
    country?: string;
    folderId?: string;
    myUrl?: string;
  } | null;
  if (!body?.keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const res = await createBrief(user.id, {
    keyword: body.keyword,
    country: body.country,
    folderId: body.folderId,
    myUrl: body.myUrl,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  return NextResponse.json({
    id: res.id,
    keyword: body.keyword,
    country: body.country || "fr",
    score: res.score,
    crawled: res.crawled,
    total: res.total,
  });
}
