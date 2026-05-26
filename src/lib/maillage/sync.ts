// Pipeline de synchronisation du sitemap d'un client vers son
// client_url_index. Conçu pour tourner dans un consumer Worker avec un
// budget CPU borné (~250s pour rester sous la limite 300s Workers Paid).
//
// Stratégie sans dépendance au lastmod du sitemap :
//
// 1. fetchAndParseSitemap() retourne la liste à plat des <loc>.
// 2. On diff vs les URLs déjà connues en BDD :
//    - nouvelles : à crawler + embed
//    - disparues : on les marque isActive = false (on garde la row au cas où
//      elles reviendraient au prochain sync, ça évite un re-crawl complet)
//    - existantes : on les vérifie selon le mode
// 3. Pour chaque URL à vérifier :
//    - HEAD request : si ETag ou Last-Modified inchangé, on touch juste
//      `lastCheckedAt` et on skip
//    - sinon GET + hash : si hash inchangé, on touch `lastCheckedAt` mais
//      pas de ré-embedding (le contenu pertinent n'a pas bougé)
//    - sinon ré-embedding + update complet
//
// Mode "initial" : process toutes les URLs nouvelles. Si on dépasse le
// budget CPU, on s'arrête proprement et on retourne `hasMore=true` pour
// que l'appelant (cron ou consumer) puisse enqueuer un follow-up.
//
// Mode "incremental" : process une fraction (1/7) des URLs déjà connues,
// en privilégiant les plus anciennement vérifiées. + traite toutes les
// nouvelles URLs vues au sitemap depuis la dernière sync.

import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { client, clientUrlIndex } from "@/db/schema";
import type * as schema from "@/db/schema";
import { fetchAndParseSitemap } from "./sitemap-parser";
import { crawlUrlForIndex, headCheck } from "./url-crawler";
import { buildUrlEmbeddingInput, embedTexts, encodeEmbedding } from "./url-embedder";
import type { BrightDataEnv } from "./brightdata-fetch";
import type { SitemapSyncMode } from "./types";

const DEFAULT_CPU_BUDGET_MS = 240_000;
const INCREMENTAL_ROTATION_FRACTION = 1 / 7;
const URLS_PER_BATCH = 50;

type DB = DrizzleD1Database<typeof schema>;

export type SyncResult = {
  ok: boolean;
  mode: SitemapSyncMode;
  urlsInSitemap: number;
  urlsAdded: number;
  urlsRemoved: number;
  urlsChecked: number;
  urlsReembedded: number;
  hasMore: boolean;
  error?: string;
};

export async function syncClientSitemap(
  db: DB,
  ai: Ai | undefined,
  clientId: string,
  mode: SitemapSyncMode,
  opts: { cpuBudgetMs?: number; brightData?: BrightDataEnv } = {},
): Promise<SyncResult> {
  const brightData = opts.brightData ?? {};
  const t0 = Date.now();
  const budgetMs = opts.cpuBudgetMs ?? DEFAULT_CPU_BUDGET_MS;
  const stopAt = t0 + budgetMs;
  const result: SyncResult = {
    ok: false,
    mode,
    urlsInSitemap: 0,
    urlsAdded: 0,
    urlsRemoved: 0,
    urlsChecked: 0,
    urlsReembedded: 0,
    hasMore: false,
  };

  const clientRow = await db.select().from(client).where(eq(client.id, clientId)).get();
  if (!clientRow) {
    result.error = "client introuvable";
    return result;
  }
  if (!clientRow.sitemapUrl) {
    result.error = "pas de sitemap configuré";
    return result;
  }

  // Marquer le client comme en cours de sync
  await db
    .update(client)
    .set({ sitemapStatus: "syncing", sitemapError: null })
    .where(eq(client.id, clientId));

  try {
    const sitemapEntries = await fetchAndParseSitemap(clientRow.sitemapUrl, brightData);
    if (sitemapEntries.length === 0) {
      result.error = "sitemap vide ou injoignable";
      await db
        .update(client)
        .set({ sitemapStatus: "failed", sitemapError: result.error })
        .where(eq(client.id, clientId));
      return result;
    }
    result.urlsInSitemap = sitemapEntries.length;

    const sitemapUrls = new Set(sitemapEntries.map((e) => e.loc));

    // Charge les rows existantes pour ce client
    const existing = await db
      .select()
      .from(clientUrlIndex)
      .where(eq(clientUrlIndex.clientId, clientId))
      .all();
    const existingByUrl = new Map(existing.map((r) => [r.url, r]));

    // Réactiver les URLs qui reviennent au sitemap (isActive = true) et
    // désactiver celles qui en disparaissent.
    const toDeactivate: string[] = [];
    const toReactivate: string[] = [];
    for (const row of existing) {
      const inSitemap = sitemapUrls.has(row.url);
      if (row.isActive && !inSitemap) toDeactivate.push(row.url);
      else if (!row.isActive && inSitemap) toReactivate.push(row.url);
    }
    if (toDeactivate.length > 0) {
      await db
        .update(clientUrlIndex)
        .set({ isActive: false })
        .where(and(eq(clientUrlIndex.clientId, clientId), inArray(clientUrlIndex.url, toDeactivate)));
    }
    if (toReactivate.length > 0) {
      await db
        .update(clientUrlIndex)
        .set({ isActive: true })
        .where(and(eq(clientUrlIndex.clientId, clientId), inArray(clientUrlIndex.url, toReactivate)));
    }
    result.urlsRemoved = toDeactivate.length;

    // Identifier les URLs nouvelles (jamais vues) et les URLs à re-vérifier.
    const newUrls = sitemapEntries.filter((e) => !existingByUrl.has(e.loc)).map((e) => e.loc);

    // En mode incremental, on prend une fraction des URLs existantes selon
    // l'ancienneté de lastCheckedAt (les plus vieilles en premier).
    let toCheckUrls: string[] = [];
    if (mode === "incremental") {
      const target = Math.max(50, Math.ceil(existing.filter((r) => r.isActive).length * INCREMENTAL_ROTATION_FRACTION));
      const sorted = existing
        .filter((r) => r.isActive)
        .sort((a, b) => (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0));
      toCheckUrls = sorted.slice(0, target).map((r) => r.url);
    }

    // En mode initial, on traite TOUTES les nouvelles URLs (jusqu'au budget).
    // Les URLs existantes ne sont pas re-vérifiées (c'est le boulot du cron
    // incremental).
    const allToProcess: { url: string; mustGet: boolean }[] = [];
    for (const u of newUrls) allToProcess.push({ url: u, mustGet: true });
    if (mode === "incremental") {
      for (const u of toCheckUrls) allToProcess.push({ url: u, mustGet: false });
    }

    // Traitement par batches en respectant le budget CPU
    for (let i = 0; i < allToProcess.length; i += URLS_PER_BATCH) {
      if (Date.now() > stopAt) {
        result.hasMore = true;
        break;
      }
      const batch = allToProcess.slice(i, i + URLS_PER_BATCH);
      await processBatch(db, ai, brightData, clientId, batch, existingByUrl, result);
    }

    // Mise à jour finale du client
    const status = result.hasMore ? "syncing" : "idle";
    await db
      .update(client)
      .set({
        sitemapStatus: status,
        sitemapLastSyncAt: new Date(),
        sitemapError: null,
      })
      .where(eq(client.id, clientId));

    result.ok = true;
    console.log(
      `[maillage] sync done client=${clientId} mode=${mode} dur=${Date.now() - t0}ms added=${result.urlsAdded} removed=${result.urlsRemoved} checked=${result.urlsChecked} reembed=${result.urlsReembedded} hasMore=${result.hasMore}`,
    );
    return result;
  } catch (e) {
    result.error = (e as Error).message;
    await db
      .update(client)
      .set({ sitemapStatus: "failed", sitemapError: result.error })
      .where(eq(client.id, clientId));
    console.log(`[maillage] sync error client=${clientId} : ${result.error}`);
    return result;
  }
}

async function processBatch(
  db: DB,
  ai: Ai | undefined,
  brightData: BrightDataEnv,
  clientId: string,
  batch: { url: string; mustGet: boolean }[],
  existingByUrl: Map<string, typeof clientUrlIndex.$inferSelect>,
  result: SyncResult,
): Promise<void> {
  type Pending = {
    url: string;
    isNew: boolean;
    crawled: Awaited<ReturnType<typeof crawlUrlForIndex>>;
    needsEmbedding: boolean;
  };
  const pending: Pending[] = [];

  // Étape 1 : pour chaque URL, décider si on GET ou si HEAD suffit
  for (const { url, mustGet } of batch) {
    const prev = existingByUrl.get(url);
    const isNew = !prev;

    if (!isNew && !mustGet) {
      const headRes = await headCheck(url, { etag: prev!.etag, lastModifiedHeader: prev!.lastModifiedHeader });
      result.urlsChecked++;
      if (!headRes.changed) {
        // Inchangé : on touch juste lastCheckedAt
        await db
          .update(clientUrlIndex)
          .set({ lastCheckedAt: new Date() })
          .where(and(eq(clientUrlIndex.clientId, clientId), eq(clientUrlIndex.url, url)));
        continue;
      }
    }

    const crawled = await crawlUrlForIndex(url, brightData);
    if (!crawled) {
      // Crawl raté : on touch lastCheckedAt même en cas d'échec pour ne pas
      // boucler dessus en permanence
      if (!isNew) {
        await db
          .update(clientUrlIndex)
          .set({ lastCheckedAt: new Date() })
          .where(and(eq(clientUrlIndex.clientId, clientId), eq(clientUrlIndex.url, url)));
      }
      continue;
    }

    const sameHash = prev && prev.contentHash === crawled.contentHash;
    const needsEmbedding = !sameHash;
    pending.push({ url, isNew, crawled, needsEmbedding });
    if (isNew) result.urlsAdded++;
    result.urlsChecked++;
  }

  // Étape 2 : embedder en batch ceux qui en ont besoin
  const toEmbed = pending.filter((p) => p.needsEmbedding);
  let embeddings: (Float32Array | null)[] = [];
  if (toEmbed.length > 0 && ai) {
    const inputs = toEmbed.map((p) => buildUrlEmbeddingInput(p.crawled!));
    embeddings = await embedTexts(ai, inputs);
    result.urlsReembedded += toEmbed.filter((_, i) => embeddings[i] !== null).length;
  }

  // Étape 3 : écrire en BDD
  let embedIdx = 0;
  for (const p of pending) {
    const c = p.crawled!;
    let embeddingBlob: Uint8Array | undefined = undefined;
    if (p.needsEmbedding) {
      const emb = embeddings[embedIdx];
      embedIdx++;
      if (emb) embeddingBlob = encodeEmbedding(emb);
    }
    const now = new Date();
    if (p.isNew) {
      await db
        .insert(clientUrlIndex)
        .values({
          id: crypto.randomUUID(),
          clientId,
          url: c.url,
          title: c.title,
          h1: c.h1,
          metaDescription: c.metaDescription,
          firstParagraph: c.firstParagraph,
          embedding: embeddingBlob,
          contentHash: c.contentHash,
          etag: c.etag,
          lastModifiedHeader: c.lastModifiedHeader,
          lastCheckedAt: now,
          lastChangedAt: now,
          isActive: true,
        })
        .onConflictDoNothing()
        .run();
    } else {
      const updates: Partial<typeof clientUrlIndex.$inferInsert> = {
        title: c.title,
        h1: c.h1,
        metaDescription: c.metaDescription,
        firstParagraph: c.firstParagraph,
        contentHash: c.contentHash,
        etag: c.etag,
        lastModifiedHeader: c.lastModifiedHeader,
        lastCheckedAt: now,
      };
      if (p.needsEmbedding) {
        updates.lastChangedAt = now;
        if (embeddingBlob) updates.embedding = embeddingBlob;
      }
      await db
        .update(clientUrlIndex)
        .set(updates)
        .where(and(eq(clientUrlIndex.clientId, clientId), eq(clientUrlIndex.url, c.url)));
    }
  }
}

