import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/auth";
import { createPendingBrief, completeBriefAnalysis } from "@/lib/briefs-service";

export const dynamic = "force-dynamic";

/**
 * Création d'un brief depuis l'UI : on insère un brief en pending tout
 * de suite et on lance l'analyse en background via ctx.waitUntil. Le
 * frontend reçoit l'id et poll /api/briefs/[id]/progress pour suivre
 * l'analyse en temps réel.
 */
export async function POST(req: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    keyword?: string;
    country?: string;
    folderId?: string;
    myUrl?: string;
  } | null;
  if (!body?.keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const input = {
    keyword: body.keyword,
    country: body.country,
    folderId: body.folderId,
    myUrl: body.myUrl,
  };
  const created = await createPendingBrief(session.user.id, input);
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

  const { ctx } = getCloudflareContext();
  ctx.waitUntil(completeBriefAnalysis(created.id, session.user.id, input));

  return NextResponse.json({
    id: created.id,
    status: "pending",
    redirect: `/app/briefs/${created.id}`,
  });
}
