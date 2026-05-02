import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/auth";
import { createPendingBrief } from "@/lib/briefs-service";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

/**
 * Création d'un brief depuis l'UI : on insère un brief en pending et on
 * envoie un message dans la queue Cloudflare `datafer-analysis`. Le
 * worker consumer dédié (workers/analysis-consumer/) prend le relais et
 * fait le crawl + NLP + scoring dans son propre budget CPU/wall, isolé
 * de l'API HTTP. Garantit zéro zombie : si le consumer crash, la queue
 * retry automatiquement, sinon DLQ.
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

  const env = getCloudflareContext().env as unknown as DataferEnv;
  if (!env.ANALYSIS_QUEUE) {
    return NextResponse.json(
      { error: "ANALYSIS_QUEUE binding missing" },
      { status: 500 },
    );
  }
  await env.ANALYSIS_QUEUE.send({
    briefId: created.id,
    userId: session.user.id,
    input,
  });

  return NextResponse.json({
    id: created.id,
    status: "pending",
    redirect: `/app/briefs/${created.id}`,
  });
}
