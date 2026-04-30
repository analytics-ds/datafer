import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { createTag, TAG_COLORS } from "@/lib/tags-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    color?: string;
  } | null;
  if (!body?.name || !body?.color)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  if (!(TAG_COLORS as readonly string[]).includes(body.color))
    return NextResponse.json({ error: "bad color" }, { status: 400 });

  const res = await createTag(body.name, body.color, "agency");
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ tag: res.tag });
}
