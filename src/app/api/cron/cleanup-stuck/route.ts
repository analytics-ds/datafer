import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cleanupStuckBriefs } from "@/lib/cleanup-stuck";

export const dynamic = "force-dynamic";

/**
 * Endpoint HTTP de backup pour le cleanup, appelé par GH Actions cron.
 * Source primaire depuis le 2026-05-03 : Cloudflare Cron Trigger natif sur
 * le worker `datafer-analysis-consumer` (cf. wrangler-analysis.toml). GH
 * Actions reste en backup au cas où le cron natif aurait un souci, mais sa
 * latence est trop variable (~50-60min en pratique malgré "* * * * *") pour
 * être la source primaire.
 */
export async function POST(req: Request) {
  const { env } = getCloudflareContext();
  const e = env as unknown as Record<string, string | undefined> & { DB?: D1Database };
  const expected = e.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  // Auth Bearer en constant-time compare (faible enjeu mais c'est gratuit).
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!provided || provided.length !== expected.length) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!e.DB) {
    return NextResponse.json({ error: "DB binding missing" }, { status: 500 });
  }
  const result = await cleanupStuckBriefs(e.DB);
  return NextResponse.json({ ok: true, ...result });
}
