import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { crawlPage } from "@/lib/analysis";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

// Cap wall-time : la cascade crawl (fetch direct → Bright Data Web Unlocker →
// Browser CDP) peut traîner sur un site JS-heavy. 75s couvre les deux premiers
// niveaux + une bonne partie du 3e ; au-delà on rend la main à l'utilisateur
// plutôt que de bloquer la modal.
const IMPORT_TIMEOUT_MS = 75_000;

/**
 * Import de contenu post-création : crawle l'URL fournie et renvoie le HTML
 * structuré (H1-H6 + paragraphes, déjà échappé par parseHTML) à injecter
 * dans l'éditeur. Persiste l'URL dans brief.my_url pour l'afficher dans
 * Insights. Le contenu lui-même est persisté par l'autosave de l'éditeur.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = body?.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "url http(s) requise" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({ id: brief.id, status: brief.status })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "brief not found" }, { status: 404 });
  if (row.status !== "ready") {
    return NextResponse.json({ error: "brief not ready" }, { status: 409 });
  }

  const env = getCloudflareContext().env as unknown as DataferEnv;
  const page = await Promise.race([
    crawlPage(url, env).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), IMPORT_TIMEOUT_MS)),
  ]);

  if (!page || page.wordCount < 30) {
    return NextResponse.json(
      { error: "Impossible de récupérer un contenu exploitable sur cette URL (page vide, bloquée ou rendue côté client)." },
      { status: 502 },
    );
  }

  await db
    .update(brief)
    .set({ myUrl: url, updatedAt: new Date() })
    .where(eq(brief.id, id));

  return NextResponse.json({
    ok: true,
    url,
    wordCount: page.wordCount,
    html: page.structuredHtml || `<p>${escapeHtml(page.text)}</p>`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
