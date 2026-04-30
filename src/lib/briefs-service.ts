import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, type Db } from "@/db";
import { brief, client } from "@/db/schema";
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
  type NlpResult,
} from "@/lib/analysis";
import { computeDetailedScore, type DetailedScore, type EditorData } from "@/lib/scoring";

export type CompetitorStats = {
  avg: number;
  best: number;
  bestUrl: string | null;
  count: number;
};

export function computeCompetitorStats(serpJson: string | null): CompetitorStats | null {
  if (!serpJson) return null;
  let parsed: SerpResult[] = [];
  try { parsed = JSON.parse(serpJson) as SerpResult[]; } catch { return null; }
  const scored = parsed.filter((r): r is SerpResult & { score: number } => typeof r.score === "number");
  if (scored.length === 0) return null;
  const avg = Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length);
  const bestRow = scored.reduce((b, r) => (r.score > b.score ? r : b), scored[0]);
  return { avg, best: bestRow.score, bestUrl: bestRow.link ?? null, count: scored.length };
}

export type CreateBriefInput = {
  keyword: string;
  country?: string;
  folderId?: string | null;
  myUrl?: string | null;
};

export type CreateBriefResult =
  | { ok: true; id: string; crawled: number; total: number; score: number }
  | { ok: false; status: number; error: string };

function scoreFromNlp(wordCount: number, usedTermsPct: number): number {
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

async function resolveFolder(
  db: Db,
  userId: string,
  folderId: string | null,
): Promise<{ ok: true; website: string | null } | { ok: false; status: number; error: string }> {
  if (!folderId) return { ok: true, website: null };
  const [f] = await db
    .select({ id: client.id, website: client.website })
    .from(client)
    .where(
      and(
        eq(client.id, folderId),
        or(eq(client.ownerId, userId), eq(client.scope, "agency")),
      ),
    )
    .limit(1);
  if (!f) return { ok: false, status: 403, error: "folder not accessible" };
  return { ok: true, website: f.website };
}

/**
 * Version sync, utilisée par la web app (POST /api/briefs). Fait tout le
 * boulot d'un coup avant de répondre.
 */
export async function createBrief(
  userId: string,
  input: CreateBriefInput,
): Promise<CreateBriefResult> {
  const keyword = input.keyword.trim();
  const country = (input.country || "fr").toLowerCase();
  const folderId = input.folderId || null;
  const myUrl = input.myUrl?.trim() || null;

  if (!keyword) return { ok: false, status: 400, error: "keyword required" };

  const db = getDb();

  let folderWebsite: string | null = null;
  if (folderId) {
    const [f] = await db
      .select({ id: client.id, website: client.website })
      .from(client)
      .where(
        and(
          eq(client.id, folderId),
          or(eq(client.ownerId, userId), eq(client.scope, "agency")),
        ),
      )
      .limit(1);
    if (!f) return { ok: false, status: 403, error: "folder not accessible" };
    folderWebsite = f.website;
  }

  const { env } = getCloudflareContext();
  const e = env as unknown as Record<string, string | undefined>;
  const provider = (e.SERP_PROVIDER === "serpapi" ? "serpapi" : "crazyserp") as
    | "crazyserp"
    | "serpapi";
  const serpKey = provider === "serpapi" ? e.SERPAPI_KEY : e.CRAZYSERP_KEY;
  const haloscanKey = e.HALOSCAN_KEY;
  if (!serpKey)
    return {
      ok: false,
      status: 500,
      error: `${provider === "serpapi" ? "SERPAPI_KEY" : "CRAZYSERP_KEY"} missing on server`,
    };

  const { results, allResults, paa } = await fetchSerp(keyword, country, serpKey, provider);
  if (!results.length) return { ok: false, status: 502, error: "no SERP results" };

  const settled = await Promise.allSettled(results.map((r) => crawlPage(r.link)));
  const crawled = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
  const pageContents: PageContent[] = [];
  const enrichedResults: SerpResult[] = results.map((r, i) => {
    const c = crawled[i];
    if (c) {
      pageContents.push(c);
      return { ...r, wordCount: c.wordCount, headings: c.headings, h1: c.h1, h2: c.h2, h3: c.h3, outline: c.outline };
    }
    return { ...r, wordCount: 0, headings: 0 };
  });
  if (pageContents.length < 3) {
    results.forEach((r) => {
      if (r.snippet) {
        pageContents.push({
          text: r.title + " " + r.snippet,
          h1: [r.title], h2: [], h3: [], outline: [{ level: 1, text: r.title }],
          headings: 1, paragraphs: 1, structuredHtml: "",
          wordCount: (r.title + " " + r.snippet).split(/\s+/).length,
        });
      }
    });
  }

  const nlp = runNLP(pageContents, keyword);

  for (let i = 0; i < enrichedResults.length; i++) {
    const c = crawled[i];
    if (!c || c.wordCount < 50) continue;
    const breakdown = computeDetailedScore(
      { text: c.text, h1s: c.h1, h2s: c.h2, h3s: c.h3 },
      nlp,
    );
    enrichedResults[i].score = breakdown.total;
  }

  const haloscan = haloscanKey ? await fetchHaloscan(keyword, country, haloscanKey) : null;
  const volume = haloscan?.search_volume ?? null;

  let kgr = haloscan?.kgr ?? null;
  let allintitleCount = haloscan?.allintitleCount ?? null;
  if (kgr == null) {
    const fallbackAllintitle = await fetchAllintitleCount(keyword, country, serpKey);
    if (fallbackAllintitle != null) {
      allintitleCount = allintitleCount ?? fallbackAllintitle;
      if (volume && volume > 0) kgr = Math.round((fallbackAllintitle / volume) * 1000) / 1000;
    }
  }

  const position = findDomainPosition(allResults, folderWebsite);

  let finalPaa = paa;
  if (haloscanKey && finalPaa.length < 5) {
    const extra = await fetchHaloscanQuestions(keyword, country, haloscanKey, 10);
    const seen = new Set(finalPaa.map((q) => q.question.toLowerCase()));
    for (const q of extra) {
      const k = q.question.toLowerCase();
      if (!seen.has(k)) { finalPaa.push(q); seen.add(k); }
      if (finalPaa.length >= 8) break;
    }
  }

  let initialEditorHtml = "";
  let myInitialScore: number | null = null;
  if (myUrl) {
    const myPage = await crawlPage(myUrl);
    if (myPage && myPage.wordCount > 50) {
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

  const id = randomUUID();
  const initialScore = myInitialScore ?? scoreFromNlp(0, 0);

  await db.insert(brief).values({
    id,
    ownerId: userId,
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
    workflowStatus: "pending",
  });

  return { ok: true, id, crawled: pageContents.length, total: results.length, score: initialScore };
}

export function htmlToEditorData(html: string): EditorData {
  const grab = (tag: string) =>
    [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
      .map((m) => stripTags(m[1]).trim())
      .filter(Boolean);
  const h1s = grab("h1");
  const h2s = grab("h2");
  const h3s = grab("h3");
  const text = stripTags(html).replace(/\s+/g, " ").trim();
  return { text, h1s, h2s, h3s };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

export type RescoreResult =
  | { ok: true; total: number; breakdown: DetailedScore; competitors: CompetitorStats | null }
  | { ok: false; status: number; error: string };

export async function rescoreBrief(briefId: string, editorHtml: string): Promise<RescoreResult> {
  const db = getDb();
  const [row] = await db
    .select({ id: brief.id, nlpJson: brief.nlpJson, serpJson: brief.serpJson, status: brief.status })
    .from(brief)
    .where(eq(brief.id, briefId))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "brief not found" };
  if (row.status === "pending") return { ok: false, status: 409, error: "brief not ready yet" };
  if (row.status === "failed") return { ok: false, status: 409, error: "brief analysis failed" };
  const nlp = row.nlpJson ? (JSON.parse(row.nlpJson) as NlpResult) : null;
  if (!nlp) return { ok: false, status: 500, error: "brief has no NLP data" };

  const ed = htmlToEditorData(editorHtml);
  const breakdown = computeDetailedScore(ed, nlp);

  await db
    .update(brief)
    .set({ editorHtml, score: breakdown.total, updatedAt: new Date() })
    .where(eq(brief.id, briefId));

  return {
    ok: true,
    total: breakdown.total,
    breakdown,
    competitors: computeCompetitorStats(row.serpJson),
  };
}

/**
 * Version async en 2 temps, utilisée par l'API v1 :
 *   1) createPendingBrief : insert immédiat avec status='pending', renvoie l'id
 *   2) completeBriefAnalysis : tourne en background (ctx.waitUntil) et update
 *      la ligne avec les résultats ou status='failed' en cas d'erreur.
 */
export async function createPendingBrief(
  userId: string,
  input: CreateBriefInput,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const keyword = input.keyword.trim();
  const country = (input.country || "fr").toLowerCase();
  const folderId = input.folderId || null;
  if (!keyword) return { ok: false, status: 400, error: "keyword required" };

  const db = getDb();
  const folder = await resolveFolder(db, userId, folderId);
  if (!folder.ok) return folder;

  const id = randomUUID();
  await db.insert(brief).values({
    id,
    ownerId: userId,
    clientId: folderId,
    keyword,
    country,
    status: "pending",
    score: 0,
    workflowStatus: "pending",
  });
  return { ok: true, id };
}

const ANALYSIS_DEADLINE_MS = 90_000;

export async function completeBriefAnalysis(
  briefId: string,
  userId: string,
  input: CreateBriefInput,
): Promise<void> {
  const db = getDb();
  try {
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`analysis timed out after ${ANALYSIS_DEADLINE_MS}ms`)),
        ANALYSIS_DEADLINE_MS,
      ),
    );
    const res = await Promise.race([
      createBriefAnalysisPayload(userId, input),
      deadline,
    ]);
    if (!res.ok) {
      await db
        .update(brief)
        .set({ status: "failed", errorMessage: res.error, updatedAt: new Date() })
        .where(eq(brief.id, briefId));
      return;
    }
    await db
      .update(brief)
      .set({
        status: "ready",
        clientId: res.clientId,
        serpJson: res.serpJson,
        nlpJson: res.nlpJson,
        haloscanJson: res.haloscanJson,
        paaJson: res.paaJson,
        editorHtml: res.editorHtml,
        score: res.score,
        volume: res.volume,
        cpc: res.cpc,
        competition: res.competition,
        kgr: res.kgr,
        allintitleCount: res.allintitleCount,
        position: res.position,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(brief.id, briefId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await db
      .update(brief)
      .set({ status: "failed", errorMessage: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(brief.id, briefId));
  }
}

type AnalysisPayload =
  | {
      ok: true;
      clientId: string | null;
      serpJson: string;
      nlpJson: string;
      haloscanJson: string | null;
      paaJson: string;
      editorHtml: string;
      score: number;
      volume: number | null;
      cpc: number | null;
      competition: number | null;
      kgr: number | null;
      allintitleCount: number | null;
      position: number | null;
    }
  | { ok: false; status: number; error: string };

async function createBriefAnalysisPayload(userId: string, input: CreateBriefInput): Promise<AnalysisPayload> {
  const keyword = input.keyword.trim();
  const country = (input.country || "fr").toLowerCase();
  const folderId = input.folderId || null;
  const myUrl = input.myUrl?.trim() || null;

  const db = getDb();
  const folder = await resolveFolder(db, userId, folderId);
  if (!folder.ok) return folder;
  const folderWebsite = folder.website;

  const { env } = getCloudflareContext();
  const e = env as unknown as Record<string, string | undefined>;
  const provider = (e.SERP_PROVIDER === "serpapi" ? "serpapi" : "crazyserp") as
    | "crazyserp"
    | "serpapi";
  const serpKey = provider === "serpapi" ? e.SERPAPI_KEY : e.CRAZYSERP_KEY;
  const haloscanKey = e.HALOSCAN_KEY;
  if (!serpKey)
    return {
      ok: false,
      status: 500,
      error: `${provider === "serpapi" ? "SERPAPI_KEY" : "CRAZYSERP_KEY"} missing on server`,
    };

  const { results, allResults, paa } = await fetchSerp(keyword, country, serpKey, provider);
  if (!results.length) return { ok: false, status: 502, error: "no SERP results" };

  const settled = await Promise.allSettled(results.map((r) => crawlPage(r.link)));
  const crawled = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
  const pageContents: PageContent[] = [];
  const enrichedResults: SerpResult[] = results.map((r, i) => {
    const c = crawled[i];
    if (c) {
      pageContents.push(c);
      return { ...r, wordCount: c.wordCount, headings: c.headings, h1: c.h1, h2: c.h2, h3: c.h3, outline: c.outline };
    }
    return { ...r, wordCount: 0, headings: 0 };
  });
  if (pageContents.length < 3) {
    results.forEach((r) => {
      if (r.snippet) {
        pageContents.push({
          text: r.title + " " + r.snippet,
          h1: [r.title], h2: [], h3: [], outline: [{ level: 1, text: r.title }],
          headings: 1, paragraphs: 1, structuredHtml: "",
          wordCount: (r.title + " " + r.snippet).split(/\s+/).length,
        });
      }
    });
  }

  const nlp = runNLP(pageContents, keyword);
  for (let i = 0; i < enrichedResults.length; i++) {
    const c = crawled[i];
    if (!c || c.wordCount < 50) continue;
    const breakdown = computeDetailedScore(
      { text: c.text, h1s: c.h1, h2s: c.h2, h3s: c.h3 },
      nlp,
    );
    enrichedResults[i].score = breakdown.total;
  }

  const haloscan = haloscanKey ? await fetchHaloscan(keyword, country, haloscanKey) : null;
  const volume = haloscan?.search_volume ?? null;
  let kgr = haloscan?.kgr ?? null;
  let allintitleCount = haloscan?.allintitleCount ?? null;
  if (kgr == null) {
    const fallbackAllintitle = await fetchAllintitleCount(keyword, country, serpKey);
    if (fallbackAllintitle != null) {
      allintitleCount = allintitleCount ?? fallbackAllintitle;
      if (volume && volume > 0) kgr = Math.round((fallbackAllintitle / volume) * 1000) / 1000;
    }
  }
  const position = findDomainPosition(allResults, folderWebsite);

  let finalPaa = paa;
  if (haloscanKey && finalPaa.length < 5) {
    const extra = await fetchHaloscanQuestions(keyword, country, haloscanKey, 10);
    const seen = new Set(finalPaa.map((q) => q.question.toLowerCase()));
    for (const q of extra) {
      const k = q.question.toLowerCase();
      if (!seen.has(k)) { finalPaa.push(q); seen.add(k); }
      if (finalPaa.length >= 8) break;
    }
  }

  let initialEditorHtml = "";
  let myInitialScore: number | null = null;
  if (myUrl) {
    const myPage = await crawlPage(myUrl);
    if (myPage && myPage.wordCount > 50) {
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

  const initialScore = myInitialScore ?? scoreFromNlp(0, 0);

  return {
    ok: true,
    clientId: folderId,
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
  };
}
