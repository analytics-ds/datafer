import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, getDbFromEnv, type Db } from "@/db";
import { brief, client } from "@/db/schema";
import type { DataferEnv } from "@/lib/datafer-env";
import {
  fetchSerp,
  fetchCrazyserpTop100,
  fetchHaloscan,
  fetchHaloscanQuestions,
  fetchAllintitleCount,
  findDomainPosition,
  crawlPage,
  runNLP,
  detectIntent,
  detectOpportunities,
  enrichWithSemantic,
  computeSemanticCentroid,
  type PageContent,
  type SerpResult,
  type NlpResult,
} from "@/lib/analysis";
import { computeDetailedScore, ensureCompetitorScores, type DetailedScore, type EditorData } from "@/lib/scoring";
import { applyBriefOverrides, parseBriefOverrides } from "@/lib/brief-overrides";
import { geoSignalsFromHtml } from "@/lib/geo-scoring";

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
  // Mots-clés secondaires optionnels saisis avant le lancement de l'analyse.
  // Stockés sur le brief et seedés dans overrides.nlpTermsAdded pour entrer
  // dans le suivi de couverture (tier Essentiels) et le scoring.
  secondaryKeywords?: string[] | null;
  country?: string;
  folderId?: string | null;
  myUrl?: string | null;
};

export const MAX_SECONDARY_KEYWORDS = 10;
// Garde-fou D1 : les mots-clés sont stockés en double (secondary_keywords +
// overrides_json) et la row brief est capée à ~30KB (cf. caps serpJson).
// 100 chars couvre largement tout mot-clé réel.
export const MAX_SECONDARY_KEYWORD_CHARS = 100;

/** lowercase + accents retirés, pour comparer des mots-clés FR entre eux. */
function foldKeyword(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Tokens significatifs d'un mot-clé (longueur > 1), avec variantes
 * singulier/pluriel. Miroir de la construction kwTokens d'isJunkNlpTerm
 * (brief-editor.tsx) : un terme dont tous les tokens sont déjà dans le
 * mot-clé principal serait masqué par le filtre UI tout en restant compté
 * dans le scoring, donc on le rejette dès la normalisation.
 */
function keywordTokenSet(keyword: string): Set<string> {
  const tokens = new Set<string>();
  foldKeyword(keyword)
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .forEach((w) => {
      tokens.add(w);
      if (w.endsWith("s")) tokens.add(w.slice(0, -1));
      else tokens.add(w + "s");
    });
  return tokens;
}

/**
 * Normalise la liste de mots-clés secondaires : trim, retire les vides, les
 * trop longs, le doublon du mot-clé principal (exact ou sous-ensemble de ses
 * tokens) et les doublons internes (case/accents-insensitive), cap à
 * MAX_SECONDARY_KEYWORDS. Accepte aussi une string "kw1, kw2" (API v1).
 */
export function normalizeSecondaryKeywords(
  raw: unknown,
  mainKeyword: string,
): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,\n;]/)
      : [];
  const mainTokens = keywordTokenSet(mainKeyword);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const kw = item.trim().replace(/\s+/g, " ");
    if (!kw || kw.length > MAX_SECONDARY_KEYWORD_CHARS) continue;
    const folded = foldKeyword(kw);
    if (seen.has(folded)) continue;
    // Rejette les mots-clés entièrement contenus dans le principal
    // ("whisky" ou "verre whisky" pour le principal "verre à whisky") :
    // déjà trackés via le mot-clé exact, et invisibles dans la sidebar.
    const kwTokens = folded
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (kwTokens.length === 0 || kwTokens.every((t) => mainTokens.has(t))) continue;
    seen.add(folded);
    out.push(kw);
    if (out.length >= MAX_SECONDARY_KEYWORDS) break;
  }
  return out;
}

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

// La version sync de createBrief a été supprimée le 2026-05-02 : remplacée
// par createPendingBrief + Cloudflare Queue + completeBriefAnalysis (cf.
// ARCHITECTURE plus bas et workers/analysis-consumer/).

export function htmlToEditorData(html: string): EditorData {
  const grab = (tag: string) =>
    [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
      .map((m) => stripTags(m[1]).trim())
      .filter(Boolean);
  const h1s = grab("h1");
  const h2s = grab("h2");
  const h3s = grab("h3");
  // Préserve les sauts de paragraphe lors du strip : insère \n\n après chaque
  // bloc fermant (p, h1-h6, li, tr, blockquote) et \n après <br>. Sans ça, le
  // critère structure du scoring (qui split sur \n\s*\n) ne voit qu'un seul
  // paragraphe géant et plombe le score à 1/6 même sur des contenus bien
  // structurés (cf. test & learn 2026-05-08).
  const withBreaks = html
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|div)\s*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = stripTags(withBreaks)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  // Compte les <img> du HTML (self-closing inclus). Sert au critère images
  // du scoring : on compare ce nombre à la médiane des concurrents.
  const imageCount = (html.match(/<img\b[^>]*>/gi) ?? []).length;
  return { text, h1s, h2s, h3s, imageCount };
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
    .select({
      id: brief.id,
      nlpJson: brief.nlpJson,
      serpJson: brief.serpJson,
      overridesJson: brief.overridesJson,
      status: brief.status,
    })
    .from(brief)
    .where(eq(brief.id, briefId))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "brief not found" };
  if (row.status === "pending") return { ok: false, status: 409, error: "brief not ready yet" };
  if (row.status === "failed") return { ok: false, status: 409, error: "brief analysis failed" };
  const nlp = row.nlpJson ? (JSON.parse(row.nlpJson) as NlpResult) : null;
  if (!nlp) return { ok: false, status: 500, error: "brief has no NLP data" };

  const ed = htmlToEditorData(editorHtml);
  // Score brut (rawTotal) directement : on n'applique plus la relativisation
  // vs médiane concurrents. Pierre veut que le score affiché user soit
  // comparable 1:1 au score brut affiché côté SERP concurrents (décision
  // 2026-05-16). On garde quand même ensureCompetitorScores pour persister
  // nlp.competitorScores (utilisé par computeCompetitorStats côté UI pour
  // afficher concurrence avg/best).
  ensureCompetitorScores(nlp, row.serpJson);
  // Scoring sur le NLP overridé (mots-clés secondaires / termes custom,
  // concurrents désactivés, wordCount), comme l'éditeur via page.tsx. Sans
  // ça, le score persisté par POST /api/v1/briefs/{id}/content ignorait les
  // overrides et divergeait du score affiché dans l'éditeur. ATTENTION : ne
  // jamais persister le NLP overridé dans nlp_json (les termes custom y
  // seraient bakés et impossibles à retirer via la modal Paramètres) ;
  // applyBriefOverrides travaille sur une copie, le backfill ci-dessus reste
  // sur le nlp brut.
  const rawSerp = row.serpJson ? (JSON.parse(row.serpJson) as SerpResult[]) : [];
  const overrides = parseBriefOverrides(row.overridesJson);
  const overridden = applyBriefOverrides({ nlp, serp: rawSerp, position: null }, overrides);
  const scoringNlp = overridden.nlp ?? nlp;
  // Si des concurrents sont désactivés, applyBriefOverrides a invalidé
  // competitorScores sur la copie : re-scoring sur le SERP filtré.
  ensureCompetitorScores(scoringNlp, JSON.stringify(overridden.serp));
  const geoSignals = geoSignalsFromHtml(editorHtml);
  const breakdown = computeDetailedScore(ed, scoringNlp, geoSignals);

  const nlpJsonToWrite = nlp.competitorScores !== undefined ? JSON.stringify(nlp) : row.nlpJson;

  await db
    .update(brief)
    .set({
      editorHtml,
      score: breakdown.total,
      nlpJson: nlpJsonToWrite,
      updatedAt: new Date(),
    })
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
  const secondaryKeywords = normalizeSecondaryKeywords(input.secondaryKeywords, keyword);

  const db = getDb();
  const folder = await resolveFolder(db, userId, folderId);
  if (!folder.ok) return folder;

  const id = randomUUID();
  await db.insert(brief).values({
    id,
    ownerId: userId,
    clientId: folderId,
    keyword,
    myUrl: input.myUrl?.trim() || null,
    secondaryKeywords: secondaryKeywords.length ? JSON.stringify(secondaryKeywords) : null,
    // Seed des mots-clés secondaires dans les overrides : ils passent par le
    // même chemin que les termes custom du back-office (applyBriefOverrides
    // les injecte en tête des termes NLP, tier Essentiels) → suivis dans
    // l'éditeur et comptés dans le scoring sans toucher au pipeline
    // d'analyse. completeBriefAnalysis n'écrase pas overridesJson.
    overridesJson: secondaryKeywords.length
      ? JSON.stringify({ nlpTermsAdded: secondaryKeywords })
      : null,
    country,
    status: "pending",
    score: 0,
    workflowStatus: "pending",
  });
  return { ok: true, id };
}

// 240s : compromis wall-time pour la cascade crawl 3 niveaux. Workers Paid
// permet jusqu'à 300s CPU (cf. wrangler-analysis.toml [limits] cpu_ms), or le
// crawl est I/O-bound (peu de CPU), donc on tient large sous ce plafond. On
// borne quand même le wall ici pour éviter qu'un crawl pathologique (Bright
// Data Browser CDP coincé sur un site JS-heavy) ne traîne indéfiniment.
// Cascade fetch direct → BD : ~70% des sites en fetch direct (1-2s) + ~30%
// en BD (5-90s). Passé de 180s à 240s le 2026-05-22 : le SERP CrazySerp peut
// désormais prendre jusqu'à 90s (2 pages × 45s) avant le crawl, il fallait
// redonner de la marge. Le cron cleanup (HEARTBEAT_STALE_MS) reste à 180s mais
// est heartbeat-based (step figée), pas une garde de durée totale.
const ANALYSIS_DEADLINE_MS = 240_000;

export async function completeBriefAnalysis(
  env: DataferEnv,
  briefId: string,
  userId: string,
  input: CreateBriefInput,
): Promise<void> {
  const db = getDbFromEnv(env);
  console.log("[brief-analysis] start", { briefId, keyword: input.keyword });
  // Hook que createBriefAnalysisPayload appelle pour déclarer son étape
  // courante. On l'écrit dans la BDD pour que le frontend (qui poll
  // /api/briefs/[id]/progress) puisse l'afficher en live.
  const setStep = async (step: string) => {
    try {
      // Met à jour analysisStep ET updatedAt : le cron cleanup-stuck se
      // base sur updatedAt pour décider qu'un brief est stuck (cf.
      // HEARTBEAT_STALE_MS dans cleanup-stuck.ts). Sans ça, un crawl long
      // (Bright Data Browser ~90s sur un site JS-heavy) ne rafraîchit
      // pas le heartbeat et le brief peut être tué malgré le worker
      // vivant. Review 2026-05-08 (L3).
      await db
        .update(brief)
        .set({ analysisStep: step, updatedAt: new Date() })
        .where(eq(brief.id, briefId));
    } catch {
      // best-effort : si l'update échoue (race / DB indisponible) on
      // continue le crawl, c'est juste de l'info live.
    }
  };
  try {
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`analysis timed out after ${ANALYSIS_DEADLINE_MS}ms`)),
        ANALYSIS_DEADLINE_MS,
      ),
    );
    const res = await Promise.race([
      createBriefAnalysisPayload(env, userId, input, setStep),
      deadline,
    ]);
    console.log("[brief-analysis] payload computed", {
      briefId,
      ok: res.ok,
      error: res.ok ? undefined : res.error,
    });
    if (!res.ok) {
      // Bascule en status='failed' + errorMessage explicite (au lieu de l'ancien
      // auto-delete 2026-05-26) : sans ça, un GET /api/v1/briefs/{id} renvoyait
      // 404 "not found" alors que le brief avait été créé OK, ce qui ressemblait
      // à un bug de mapping côté client (cas observé sur country=it / "no SERP
      // results" — Pierre 2026-05-28). On veut que le client API puisse voir
      // pourquoi l'analyse a planté.
      console.log("[brief-analysis] marking brief failed", { briefId, error: res.error });
      await db
        .update(brief)
        .set({ status: "failed", errorMessage: res.error, updatedAt: new Date() })
        .where(and(eq(brief.id, briefId), eq(brief.status, "pending")));
      return;
    }
    // Filtrer sur status="pending" : si le cron cleanup-stuck a déjà
    // basculé le brief en "failed" pendant qu'on calculait le payload,
    // on ne veut pas écraser cet état avec un "ready" tardif (le user
    // aurait vu un échec puis un succès qui apparaît comme par magie).
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
      .where(and(eq(brief.id, briefId), eq(brief.status, "pending")));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.log("[brief-analysis] marking brief failed after uncaught error", { briefId, error: msg });
    await db
      .update(brief)
      .set({ status: "failed", errorMessage: msg, updatedAt: new Date() })
      .where(and(eq(brief.id, briefId), eq(brief.status, "pending")));
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

async function createBriefAnalysisPayload(
  env: DataferEnv,
  userId: string,
  input: CreateBriefInput,
  setStep: (step: string) => Promise<void> = async () => {},
): Promise<AnalysisPayload> {
  const keyword = input.keyword.trim();
  const country = (input.country || "fr").toLowerCase();
  const folderId = input.folderId || null;
  const myUrl = input.myUrl?.trim() || null;

  const db = getDbFromEnv(env);
  const folder = await resolveFolder(db, userId, folderId);
  if (!folder.ok) return folder;
  const folderWebsite = folder.website;

  const provider = (env.SERP_PROVIDER === "serpapi" ? "serpapi" : "crazyserp") as
    | "crazyserp"
    | "serpapi";
  const serpKey = provider === "serpapi" ? env.SERPAPI_KEY : env.CRAZYSERP_KEY;
  const haloscanKey = env.HALOSCAN_KEY;
  if (!serpKey)
    return {
      ok: false,
      status: 500,
      error: `${provider === "serpapi" ? "SERPAPI_KEY" : "CRAZYSERP_KEY"} missing on server`,
    };

  await setStep("fetching_serp");
  const { results, allResults, paa } = await fetchSerp(
    keyword,
    country,
    serpKey,
    provider,
    provider === "crazyserp" ? env.CRAZYSERP_KEY_FALLBACK : undefined,
  );
  if (!results.length) return { ok: false, status: 502, error: "no SERP results" };

  await setStep(`crawling:0/${results.length}`);
  // Compteur live partagé : on update analysisStep dès qu'un site
  // termine son crawl (success ou échec). L'UI poll et voit X/10
  // monter en temps réel.
  let done = 0;
  // Si l'utilisateur a fourni "Mon URL", on lance son crawl EN PARALLÈLE
  // des concurrents pour ne pas additionner les latences Bright Data.
  // Sans ça, un crawl BD Premium sur myUrl peut ajouter 20-30s au total
  // et faire dépasser le deadline analysis 75s.
  // Retry une fois en cas d'erreur transitoire BD (5xx/429), car myUrl
  // est critique : sans elle l'éditeur démarre vide. Pour les concurrents,
  // on s'en fiche d'en perdre 1 sur 10 dans le NLP.
  const crawlMyUrlOnce = async (): Promise<PageContent | null> => {
    try {
      const r = await crawlPage(myUrl!, env);
      if (r && r.wordCount > 50) return r;
      return null;
    } catch {
      return null;
    }
  };
  const myCrawlPromise: Promise<PageContent | null> = myUrl
    ? (async () => {
        const first = await crawlMyUrlOnce();
        if (first) return first;
        // 1 retry pour gérer les 5xx/429 transitoires côté Bright Data
        console.log("[brief] myUrl first crawl failed, retrying...", { myUrl });
        await new Promise((res) => setTimeout(res, 1000));
        return crawlMyUrlOnce();
      })()
    : Promise.resolve(null);
  // Timeout global PAR SITE : crawlPage enchaîne 3 niveaux (fetch direct,
  // Bright Data Web Unlocker, Bright Data Browser CDP). Chaque niveau a son
  // propre timeout, mais en cas de chain complète (fetch 10s + BD 50s + BD
  // Browser 50s+) un site peut prendre 100s+. Pire, si BD Browser hang sans
  // libérer son timeout (cas observé sur certains sites bijouterie blindés),
  // Promise.allSettled bloque le worker indéfiniment jusqu'au cpu_ms cap.
  // Cap à 90s/site = on perd au pire 1 page sur 10 mais on finit le brief.
  // Bug observé sur "alliance diamant occasion" (2026-05-25).
  const PER_SITE_TIMEOUT_MS = 90000;
  const settled = await Promise.allSettled(
    results.map(async (r) => {
      let c: PageContent | null = null;
      let finished = false;
      try {
        c = await Promise.race([
          crawlPage(r.link, env).then((v) => {
            finished = true;
            return v;
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => {
              if (finished) return;
              console.log(`[crawl] timeout global 90s url=${r.link}`);
              resolve(null);
            }, PER_SITE_TIMEOUT_MS),
          ),
        ]);
      } catch (e) {
        console.log(`[crawl] exception url=${r.link} err=${e instanceof Error ? e.message : String(e)}`);
      }
      done++;
      // best-effort, on s'en fiche si l'update DB échoue ponctuellement
      void setStep(`crawling:${done}/${results.length}`);
      return c;
    }),
  );
  const crawled = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
  const pageContents: PageContent[] = [];
  // Cap text/structuredHtml par concurrent avant persistance dans serpJson :
  // un PDF universitaire de 20k+ mots (cas "intelligenza artificiale hr" sur
  // tesi.luiss.it, 2026-05-28) produit ~150KB de text + autant de
  // structuredHtml, multiplié par 10 concurrents = serpJson > 2MB qui fait
  // sauter l'UPDATE D1 final (row size limit) et laisse le brief en pending.
  // L'analyse NLP/scoring/sémantique a déjà tourné sur le contenu complet via
  // pageContents — on ne perd rien côté analyse, juste le snapshot affiché
  // dans l'onglet SERP qui n'a pas besoin du PDF in extenso.
  const MAX_TEXT_CHARS = 30_000;
  const MAX_STRUCTURED_HTML_CHARS = 30_000;
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
  const enrichedResults: SerpResult[] = results.map((r, i) => {
    const c = crawled[i];
    if (c) {
      pageContents.push(c);
      return {
        ...r,
        wordCount: c.wordCount,
        headings: c.headings,
        paragraphs: c.paragraphs,
        h1: c.h1,
        h2: c.h2,
        h3: c.h3,
        outline: c.outline,
        text: truncate(c.text, MAX_TEXT_CHARS),
        structuredHtml: truncate(c.structuredHtml, MAX_STRUCTURED_HTML_CHARS),
        imageCount: c.imageCount,
      };
    }
    return { ...r, wordCount: 0, headings: 0, imageCount: 0 };
  });
  if (pageContents.length < 3) {
    results.forEach((r) => {
      if (r.snippet) {
        pageContents.push({
          text: r.title + " " + r.snippet,
          h1: [r.title], h2: [], h3: [], outline: [{ level: 1, text: r.title }],
          headings: 1, paragraphs: 1, structuredHtml: "",
          wordCount: (r.title + " " + r.snippet).split(/\s+/).length,
          imageCount: 0,
        });
      }
    });
  }

  await setStep("analyzing_nlp");
  let nlp = runNLP(pageContents, keyword);
  // Intent + embeddings sémantiques (cf. createBrief). Mode dégradé si AI
  // binding absent.
  nlp.intent = detectIntent(keyword, results);
  const aiBinding = (env as unknown as { AI?: Ai }).AI;
  nlp = await enrichWithSemantic(nlp, keyword, aiBinding);
  // Centroïde sémantique top 10 : embed les paragraphes ≥40 mots de chaque
  // concurrent, calcule le vecteur moyen. Sert au scoring "Proximité
  // sémantique Google" côté éditeur (cosinus paragraphe user vs centroïde).
  // Itération 8 (2026-05-08, validée Pierre option A : blendé dans le 100).
  const semantic = await computeSemanticCentroid(pageContents, aiBinding);
  if (semantic) {
    nlp.semanticCentroid = semantic.centroid;
    nlp.competitorSemanticScores = semantic.competitorScores;
  }
  // Scores bruts des concurrents : utilisés pour la relativisation du
  // score user (cf. relativizeScore dans scoring.ts). On stocke aussi
  // chaque score sur enrichedResults[i].score pour l'affichage SERP.
  const competitorScores: number[] = [];
  for (let i = 0; i < enrichedResults.length; i++) {
    const c = crawled[i];
    if (!c || c.wordCount < 50) continue;
    // Signaux GEO du concurrent extraits depuis structuredHtml (variante
    // sans DOM, utilisable côté worker). Permet au score brut concurrent
    // d'inclure le GEO comme côté user, donc cohérent à comparer.
    const geoSignals = c.structuredHtml ? geoSignalsFromHtml(c.structuredHtml) : undefined;
    const breakdown = computeDetailedScore(
      { text: c.text, h1s: c.h1, h2s: c.h2, h3s: c.h3, imageCount: c.imageCount },
      nlp,
      geoSignals,
    );
    enrichedResults[i].score = breakdown.rawTotal;
    competitorScores.push(breakdown.rawTotal);
  }
  nlp.competitorScores = competitorScores;

  await setStep("scoring");
  const haloscan = haloscanKey ? await fetchHaloscan(keyword, country, haloscanKey) : null;
  const volume = haloscan?.search_volume ?? null;
  let kgr = haloscan?.kgr ?? null;
  let allintitleCount = haloscan?.allintitleCount ?? null;
  // fetchAllintitleCount utilise SerpAPI hardcoded ; n'a de sens que si
  // le provider courant est SerpAPI (avec CrazySerp on n'a pas l'opérateur
  // allintitle). Sinon kgr reste null.
  if (kgr == null && provider === "serpapi" && env.SERPAPI_KEY) {
    const fallbackAllintitle = await fetchAllintitleCount(keyword, country, env.SERPAPI_KEY);
    if (fallbackAllintitle != null) {
      allintitleCount = allintitleCount ?? fallbackAllintitle;
      if (volume && volume > 0) kgr = Math.round((fallbackAllintitle / volume) * 1000) / 1000;
    }
  }
  let position = findDomainPosition(allResults, folderWebsite);
  // Si le client a un site mais qu'on ne le trouve pas dans le top 10/17 servi
  // par CrazySerp page=1+2, on déclenche un appel page=10 (top 100, 10 crédits
  // FR) pour chercher la position au-delà. Pas fait pour SerpAPI : son fetch
  // par défaut renvoie déjà le top 100.
  if (
    folderWebsite &&
    position == null &&
    provider === "crazyserp" &&
    env.CRAZYSERP_KEY
  ) {
    console.log("[brief] client absent du top 10, recherche top 100 via CrazySerp page=10", {
      keyword,
      folderWebsite,
    });
    const extended = await fetchCrazyserpTop100(
      keyword,
      country,
      env.CRAZYSERP_KEY,
      env.CRAZYSERP_KEY_FALLBACK,
    );
    if (extended.length > allResults.length) {
      position = findDomainPosition(extended, folderWebsite);
      console.log("[brief] résultat top 100", {
        position,
        scannedResults: extended.length,
      });
    }
  }

  const finalPaa = paa;
  if (haloscanKey && finalPaa.length < 5) {
    const extra = await fetchHaloscanQuestions(keyword, country, haloscanKey, 10);
    const seen = new Set(finalPaa.map((q) => q.question.toLowerCase()));
    for (const q of extra) {
      const k = q.question.toLowerCase();
      if (!seen.has(k)) { finalPaa.push(q); seen.add(k); }
      if (finalPaa.length >= 8) break;
    }
  }

  // Détecte les questions PAA peu couvertes par les concurrents : opportunités
  // pour le rédacteur. Utilise les pageContents qui ont du vrai contenu.
  const realPages = pageContents.filter((p) => p.wordCount > 100 && p.paragraphs > 1);
  if (realPages.length >= 3) {
    nlp.opportunities = detectOpportunities(finalPaa, realPages);
  }

  let initialEditorHtml = "";
  let myInitialScore: number | null = null;
  if (myUrl) {
    // myCrawlPromise a été lancé en parallèle du crawl des concurrents
    // (cf. plus haut). On récupère ici son résultat sans re-crawler.
    const myPage = await myCrawlPromise;
    console.log("[brief] myUrl crawl result", {
      myUrl,
      ok: !!myPage,
      wordCount: myPage?.wordCount ?? 0,
    });
    if (myPage && myPage.wordCount > 50) {
      // structuredHtml contient les blocs H1/H2/H3/P dans l'ordre du
      // document, déjà escape-html. Préserve la hiérarchie de la page
      // originale au lieu de tout aplatir en un gros <p>. Fallback sur
      // l'ancienne construction si structuredHtml est vide (briefs créés
      // avant le rajout de ce champ dans parseHTML).
      if (myPage.structuredHtml && myPage.structuredHtml.length > 0) {
        initialEditorHtml = myPage.structuredHtml;
      } else {
        const blocks: string[] = [];
        for (const h of myPage.outline) {
          const tag = `h${h.level}`;
          blocks.push(`<${tag}>${escapeHtml(h.text)}</${tag}>`);
        }
        blocks.push(`<p>${escapeHtml(myPage.text)}</p>`);
        initialEditorHtml = blocks.join("\n");
      }
      const myGeoSignals = myPage.structuredHtml ? geoSignalsFromHtml(myPage.structuredHtml) : undefined;
      const breakdown = computeDetailedScore(
        { text: myPage.text, h1s: myPage.h1, h2s: myPage.h2, h3s: myPage.h3, imageCount: myPage.imageCount },
        nlp,
        myGeoSignals,
      );
      myInitialScore = breakdown.total;
    }
  }

  const initialScore = myInitialScore ?? scoreFromNlp(0, 0);
  await setStep("saving");

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
