import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  fetchSerp,
  fetchHaloscan,
  crawlPage,
  runNLP,
  type PageContent,
  type SerpResult,
} from "@/lib/analysis";

export const dynamic = "force-dynamic";
// Le cumul SERP + 10 crawls + Haloscan dépasse le budget par défaut.
// Cloudflare Workers "Standard" autorise des handlers longs grâce au CPU
// time limit ; on configure la route en conséquence.
export const maxDuration = 60;

function scoreFromNlp(wordCount: number, usedTermsPct: number): number {
  // Score simple pour la liste "récents" avant l'ouverture de l'éditeur.
  // Le vrai scoring /100 est calculé en temps réel côté éditeur.
  const wcPart = Math.min(100, (wordCount / 1000) * 40);
  const semPart = Math.min(60, usedTermsPct * 0.6);
  return Math.round(wcPart + semPart);
}

export async function POST(req: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    keyword?: string;
    country?: string;
    folderId?: string;
  } | null;

  const keyword = body?.keyword?.trim();
  const country = (body?.country || "fr").toLowerCase();
  const folderId = body?.folderId || null;

  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const db = getDb();

  // Vérifier que le dossier demandé est bien accessible au user
  if (folderId) {
    const [f] = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(
          eq(client.id, folderId),
          or(eq(client.ownerId, session.user.id), eq(client.scope, "agency")),
        ),
      )
      .limit(1);
    if (!f) return NextResponse.json({ error: "folder not accessible" }, { status: 403 });
  }

  const { env } = getCloudflareContext();
  const e = env as unknown as Record<string, string | undefined>;
  const serpKey = e.SERPAPI_KEY;
  const haloscanKey = e.HALOSCAN_KEY;

  if (!serpKey) {
    return NextResponse.json({ error: "SERPAPI_KEY missing on server" }, { status: 500 });
  }

  // 1) SERP + PAA
  const { results, paa } = await fetchSerp(keyword, country, serpKey);
  if (!results.length) {
    return NextResponse.json({ error: "no SERP results" }, { status: 502 });
  }

  // 2) Crawl parallèle des 10 résultats (avec timeout par page)
  const crawled = await Promise.all(results.map((r) => crawlPage(r.link)));
  const pageContents: PageContent[] = [];
  const enrichedResults: SerpResult[] = results.map((r, i) => {
    const c = crawled[i];
    if (c) {
      pageContents.push(c);
      return { ...r, wordCount: c.wordCount, headings: c.headings };
    }
    return { ...r, wordCount: 0, headings: 0 };
  });

  // Fallback : si moins de 3 pages crawlées, on injecte les snippets
  if (pageContents.length < 3) {
    results.forEach((r) => {
      if (r.snippet) {
        pageContents.push({
          text: r.title + " " + r.snippet,
          h1: [r.title],
          h2: [],
          h3: [],
          headings: 1,
          paragraphs: 1,
          wordCount: (r.title + " " + r.snippet).split(/\s+/).length,
        });
      }
    });
  }

  // 3) NLP / TF-IDF
  const nlp = runNLP(pageContents, keyword);

  // 4) Haloscan (best-effort)
  const haloscan = haloscanKey ? await fetchHaloscan(keyword, country, haloscanKey) : null;

  // 5) Insert en DB
  const id = randomUUID();
  const initialScore = scoreFromNlp(0, 0); // pas encore de contenu rédigé

  await db.insert(brief).values({
    id,
    ownerId: session.user.id,
    clientId: folderId,
    keyword,
    country,
    serpJson: JSON.stringify(enrichedResults),
    nlpJson: JSON.stringify(nlp),
    haloscanJson: haloscan ? JSON.stringify(haloscan) : null,
    paaJson: JSON.stringify(paa),
    editorHtml: "",
    score: initialScore,
  });

  return NextResponse.json({
    id,
    redirect: `/app/briefs/${id}`,
    crawled: pageContents.length,
    total: results.length,
  });
}
