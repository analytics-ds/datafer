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
  fetchHaloscanQuestions,
  fetchAllintitleCount,
  findDomainPosition,
  crawlPage,
  runNLP,
  type PageContent,
  type SerpResult,
} from "@/lib/analysis";
import { computeDetailedScore } from "@/lib/scoring";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    myUrl?: string;
  } | null;

  const keyword = body?.keyword?.trim();
  const country = (body?.country || "fr").toLowerCase();
  const folderId = body?.folderId || null;
  const myUrl = body?.myUrl?.trim() || null;

  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const db = getDb();

  // Vérifier que le dossier demandé est bien accessible au user, et
  // récupérer son website pour pouvoir calculer la position dans la SERP.
  let folderWebsite: string | null = null;
  if (folderId) {
    const [f] = await db
      .select({ id: client.id, website: client.website })
      .from(client)
      .where(
        and(
          eq(client.id, folderId),
          or(eq(client.ownerId, session.user.id), eq(client.scope, "agency")),
        ),
      )
      .limit(1);
    if (!f) return NextResponse.json({ error: "folder not accessible" }, { status: 403 });
    folderWebsite = f.website;
  }

  const { env } = getCloudflareContext();
  const e = env as unknown as Record<string, string | undefined>;
  const serpKey = e.SERPAPI_KEY;
  const haloscanKey = e.HALOSCAN_KEY;

  if (!serpKey) {
    return NextResponse.json({ error: "SERPAPI_KEY missing on server" }, { status: 500 });
  }

  // 1) SERP + PAA. allResults = top 100 utilisé pour la position client.
  const { results, allResults, paa } = await fetchSerp(keyword, country, serpKey);
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
      return {
        ...r,
        wordCount: c.wordCount,
        headings: c.headings,
        h1: c.h1,
        h2: c.h2,
        h3: c.h3,
        outline: c.outline,
      };
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
          outline: [{ level: 1, text: r.title }],
          headings: 1,
          paragraphs: 1,
          wordCount: (r.title + " " + r.snippet).split(/\s+/).length,
        });
      }
    });
  }

  // 3) NLP / TF-IDF
  const nlp = runNLP(pageContents, keyword);

  // 3a) Score SEO de chaque concurrent crawlé (même algo que celui appliqué
  // à la rédaction côté éditeur). Permet d'afficher la moyenne SERP + le
  // meilleur dans l'éditeur pour donner un objectif concret.
  for (let i = 0; i < enrichedResults.length; i++) {
    const c = crawled[i];
    if (!c || c.wordCount < 50) continue;
    const breakdown = computeDetailedScore(
      { text: c.text, h1s: c.h1, h2s: c.h2, h3s: c.h3 },
      nlp,
    );
    enrichedResults[i].score = breakdown.total;
  }

  // 4) Haloscan (best-effort)
  const haloscan = haloscanKey ? await fetchHaloscan(keyword, country, haloscanKey) : null;
  const volume = haloscan?.search_volume ?? null;

  // 4a) KGR : Haloscan le donne directement quand dispo, sinon on tente le
  // calcul via SerpAPI allintitle. Idem pour allintitle.
  let kgr = haloscan?.kgr ?? null;
  let allintitleCount = haloscan?.allintitleCount ?? null;
  if (kgr == null) {
    const fallbackAllintitle = await fetchAllintitleCount(keyword, country, serpKey);
    if (fallbackAllintitle != null) {
      allintitleCount = allintitleCount ?? fallbackAllintitle;
      if (volume && volume > 0) {
        kgr = Math.round((fallbackAllintitle / volume) * 1000) / 1000;
      }
    }
  }

  // 4c) Position du dossier (top 100) si on a un site rattaché.
  const position = findDomainPosition(allResults, folderWebsite);

  // 4b) Si SERPAPI n'a pas remonté assez de PAA (Google n'affiche pas toujours
  // le bloc "Autres questions"), on complète avec Haloscan /keywords/questions.
  let finalPaa = paa;
  if (haloscanKey && finalPaa.length < 5) {
    const extra = await fetchHaloscanQuestions(keyword, country, haloscanKey, 10);
    const seen = new Set(finalPaa.map((q) => q.question.toLowerCase()));
    for (const q of extra) {
      const k = q.question.toLowerCase();
      if (!seen.has(k)) {
        finalPaa.push(q);
        seen.add(k);
      }
      if (finalPaa.length >= 8) break;
    }
  }

  // 4d) Si l'utilisateur a fourni son URL, on la crawle et on injecte le
  // contenu dans l'éditeur. On calcule aussi son score initial face à la SERP.
  let initialEditorHtml = "";
  let myInitialScore: number | null = null;
  if (myUrl) {
    const myPage = await crawlPage(myUrl);
    if (myPage && myPage.wordCount > 50) {
      // Reconstruction d'un HTML léger pour l'éditeur : on conserve le plan Hn
      // dans l'ordre, et on injecte le texte tel quel en un seul paragraphe par
      // bloc. Suffisant pour récupérer le scoring, le user pourra reformatter.
      const blocks: string[] = [];
      for (const h of myPage.outline) {
        const tag = `h${h.level}`;
        blocks.push(`<${tag}>${escapeHtml(h.text)}</${tag}>`);
      }
      blocks.push(`<p>${escapeHtml(myPage.text)}</p>`);
      initialEditorHtml = blocks.join("\n");

      const breakdown = computeDetailedScore(
        { text: myPage.text, h1s: myPage.h1, h2s: myPage.h2, h3s: myPage.h3 },
        nlp,
      );
      myInitialScore = breakdown.total;
    }
  }

  // 5) Insert en DB
  const id = randomUUID();
  const initialScore = myInitialScore ?? scoreFromNlp(0, 0); // 0 si pas de contenu de départ

  await db.insert(brief).values({
    id,
    ownerId: session.user.id,
    clientId: folderId,
    keyword,
    country,
    serpJson: JSON.stringify(enrichedResults),
    nlpJson: JSON.stringify(nlp),
    haloscanJson: haloscan ? JSON.stringify(haloscan) : null,
    paaJson: JSON.stringify(finalPaa),
    editorHtml: initialEditorHtml,
    score: initialScore,
    volume,
    cpc: haloscan?.cpc ?? null,
    competition: haloscan?.competition ?? null,
    kgr,
    allintitleCount,
    position,
  });

  return NextResponse.json({
    id,
    redirect: `/app/briefs/${id}`,
    crawled: pageContents.length,
    total: results.length,
  });
}
