import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { crawlPage, type CrawlDiag } from "@/lib/analysis";
import type { CorpusEnv } from "@/lib/corpus-env";

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

  const env = getCloudflareContext().env as unknown as CorpusEnv;
  const diag: CrawlDiag = {};
  const page = await Promise.race([
    crawlPage(url, env, { diag }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), IMPORT_TIMEOUT_MS)),
  ]);

  if (!page || page.wordCount < 30) {
    // Un 401/402/403 renvoyé par Bright Data n'est pas un problème de page :
    // c'est le filet anti-bot qui est hors service (compte suspendu pour
    // solde, ou token périmé). Vu le 2026-09-01 : Web Unlocker 401 + Scraping
    // Browser 403 sur 100% des URLs, alors que la page cible était lisible en
    // navigateur. Le message générique envoyait chercher la cause du mauvais
    // côté, on nomme donc la vraie.
    const providerStatus = [diag.level2Status, diag.level3Status].find(
      (s) => s === 401 || s === 402 || s === 403,
    );
    return NextResponse.json(
      {
        error: providerStatus
          ? `Le service de déblocage anti-bot ne répond plus (Bright Data HTTP ${providerStatus}) : compte à vérifier. La page est protégée, pas vide.`
          : "Impossible de récupérer un contenu exploitable sur cette URL (page vide, bloquée ou rendue côté client).",
        diag,
      },
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
