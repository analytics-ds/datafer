import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveUser } from "@/lib/api-auth";
import { createPendingBrief } from "@/lib/briefs-service";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

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

  const input = {
    keyword: body.keyword,
    country: body.country,
    folderId: body.folderId,
    myUrl: body.myUrl,
  };

  const created = await createPendingBrief(user.id, input);
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
    userId: user.id,
    input,
  });

  // Renvoie keyword/country/folderId dans la réponse pour que les clients
  // qui POST en parallèle (ex : `&` shell, Promise.all) puissent mapper chaque
  // réponse à sa requête sans avoir à enchaîner un GET V2. Sans ça, l'ordre
  // des réponses n'est pas garanti et le mapping ID → keyword peut être faux.
  return NextResponse.json({
    id: created.id,
    status: "pending",
    keyword: input.keyword,
    country: (input.country || "fr").toLowerCase(),
    folderId: input.folderId ?? null,
    message: "brief en cours d'analyse, interroger GET /api/v1/briefs/{id}",
  });
}
