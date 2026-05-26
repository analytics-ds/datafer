import { sqliteTable, text, integer, real, blob, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Better-auth tables (names must match better-auth defaults) ──────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  // Better-auth exige `name`; on le maintient = `${firstName} ${lastName}` côté backend
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  // Vrai au 1er login (compte créé par admin avec mdp par défaut "1234").
  // Le flag est remis à false après le 1er changement de mot de passe.
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  // Cumul XP gagné. Source de vérité = brief.xpAwarded (les flags par brief),
  // ce champ est un cache pour éviter de re-sommer à chaque affichage. Mis à
  // jour à chaque award (création brief, dépassement médiane, dépassement
  // best concurrent). Reset possible via update direct si besoin de debug.
  totalXp: integer("total_xp").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// ─── Domain tables ───────────────────────────────────────────────────────────

export const client = sqliteTable("client", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // 'personal' = visible par l'owner uniquement
  // 'agency'   = dossier datashake, visible par tous les users authentifiés
  scope: text("scope", { enum: ["personal", "agency"] }).notNull().default("personal"),
  name: text("name").notNull(),
  website: text("website"),
  color: text("color"),
  notes: text("notes"),
  // Partage externe : si shareToken est présent, le dossier est accessible
  // en lecture seule sur /share/<token> (sans auth).
  shareToken: text("share_token").unique(),
  // Sitemap source pour le maillage interne. Si null, pas d'index URL et la
  // section Maillage interne reste vide côté brief.
  sitemapUrl: text("sitemap_url"),
  sitemapLastSyncAt: integer("sitemap_last_sync_at", { mode: "timestamp" }),
  // 'idle' = pas en cours, 'syncing' = en cours, 'failed' = dernier run KO.
  sitemapStatus: text("sitemap_status", { enum: ["idle", "syncing", "failed"] })
    .notNull()
    .default("idle"),
  sitemapError: text("sitemap_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Index des URLs publiques d'un client, alimenté à partir de son sitemap.
// Sert au moteur de suggestions de maillage interne dans les briefs : pour
// chaque paragraphe du brief en cours d'édition, on cherche la ou les URLs
// du client sémantiquement les plus proches via cosinus(embedding).
//
// Refresh : pas de dépendance au lastmod du sitemap (souvent absent ou
// mensonger). À chaque sync incrémental, HEAD request -> compare
// Last-Modified/ETag -> sinon GET direct (gratuit) + hash du contenu
// extrait -> skip embedding si hash inchangé. Voir src/lib/maillage/sync.ts.
export const clientUrlIndex = sqliteTable(
  "client_url_index",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    h1: text("h1"),
    metaDescription: text("meta_description"),
    // Premier paragraphe extrait (200 mots max) pour donner du contexte
    // à l'embedding. Stocké aussi pour pouvoir le ré-embedder en cas de
    // changement de modèle sans re-crawler.
    firstParagraph: text("first_paragraph"),
    // Embedding bge-m3 (1024 dim, float32) sérialisé en BLOB.
    // Float32Array(1024).buffer côté écriture / lecture.
    embedding: blob("embedding"),
    // Hash SHA-256 du concat normalisé (title + h1 + meta + firstParagraph).
    // Permet de skipper le re-embedding si le contenu pertinent n'a pas
    // bougé même quand le HTML complet a changé (changement de footer, etc.).
    contentHash: text("content_hash"),
    // Headers HTTP capturés au dernier check, pour faire un HEAD ultra léger
    // au prochain run et skip le GET complet si rien n'a bougé.
    etag: text("etag"),
    lastModifiedHeader: text("last_modified_header"),
    // Timestamps de cycle de vie.
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
    lastChangedAt: integer("last_changed_at", { mode: "timestamp" }),
    discoveredAt: integer("discovered_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    // false = URL retirée du sitemap au dernier sync (on garde la row pour
    // pouvoir détecter une réapparition sans tout re-crawler).
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    uniqueIndex("client_url_index_url_unique").on(t.clientId, t.url),
  ],
);

// Favoris de dossiers, per-user. Les dossiers favoris remontent dans la
// sidebar gauche.
export const folderFavorite = sqliteTable(
  "folder_favorite",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull().references(() => client.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.folderId] })],
);

export const apiKey = sqliteTable("api_key", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

export const brief = sqliteTable("brief", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
  keyword: text("keyword").notNull(),
  country: text("country").notNull().default("fr"),
  shareToken: text("share_token").unique(),
  // JSON blobs for the analysis snapshots and editor content
  serpJson: text("serp_json"),
  nlpJson: text("nlp_json"),
  haloscanJson: text("haloscan_json"),
  paaJson: text("paa_json"),
  // Overrides back-office sur les data d'analyse : position, word count
  // min/max/avg, concurrents désactivés du top 10, termes NLP ajoutés/retirés.
  // Appliqués au runtime avant scoring/affichage ; la data brute SERP/Haloscan
  // reste intacte dans les colonnes dédiées.
  overridesJson: text("overrides_json"),
  // Flags d'XP gagné sur ce brief (JSON {created, aboveMedian, aboveBest}).
  // Idempotent : une fois un flag à true, l'XP correspondant est définitif
  // même si le score user redescend en dessous du seuil. Évite le farming
  // par allers-retours sur le score.
  xpAwarded: text("xp_awarded"),
  editorHtml: text("editor_html"),
  score: integer("score"),
  // Snapshots Haloscan + position client, stockés en colonnes pour pouvoir
  // les afficher sur les listes (cards) sans relire le JSON Haloscan.
  volume: integer("volume"),
  cpc: real("cpc"),
  competition: real("competition"),
  kgr: real("kgr"),
  allintitleCount: integer("allintitle_count"),
  // Position du domaine du dossier dans le top 10. null = non positionné.
  position: integer("position"),
  // 'pending' = analyse en cours (créé via API v1, analyse async)
  // 'ready'   = analyse terminée, score dispo
  // 'failed'  = l'analyse SERP/crawl a planté
  status: text("status", { enum: ["pending", "ready", "failed"] }).notNull().default("ready"),
  errorMessage: text("error_message"),
  // Étape courante de l'analyse, pour le suivi temps réel côté UI :
  // "fetching_serp" → "crawling" → "analyzing_nlp" → "scoring" → "saving".
  analysisStep: text("analysis_step"),
  // Statut éditorial du brief, distinct du `status` technique ci-dessus.
  // 'pending'     = en attente (créé, pas encore commencé)
  // 'in_progress' = en cours de rédaction
  // 'drafted'     = rédigé (relecture / validation)
  // 'published'   = publié en ligne
  workflowStatus: text("workflow_status", {
    enum: ["pending", "in_progress", "drafted", "published"],
  })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Tags scopés par client (folder). Le tag "saison hiver" de Faguo n'existe
// que dans l'écosystème Faguo. Unique sur (client_id, name) pour qu'un
// même nom puisse réapparaître chez un autre client.
export const tag = sqliteTable(
  "tag",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    // Trace l'origine : 'agency' (créé en backoffice) ou 'client' (créé via
    // un lien /share/<token>). Permet de distinguer dans l'UI si besoin.
    source: text("source", { enum: ["agency", "client"] }).notNull().default("agency"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("tag_client_name_unique").on(t.clientId, t.name)],
);

// M2M brief ↔ tag.
export const briefTag = sqliteTable(
  "brief_tag",
  {
    briefId: text("brief_id").notNull().references(() => brief.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.briefId, t.tagId] })],
);

// Feedback envoyé par les consultants depuis le widget chatbot bas-droite.
// Email/name dénormalisés pour rester lisibles si l'utilisateur est supprimé
// plus tard. Screenshots en JSON array de data URLs base64 (limite côté API
// pour éviter les rows trop lourdes). Statut workflow géré par Pierre côté
// page admin.
export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  userEmail: text("user_email").notNull(),
  userName: text("user_name").notNull(),
  category: text("category", { enum: ["bug", "suggestion", "question"] }).notNull(),
  message: text("message").notNull(),
  url: text("url").notNull(),
  userAgent: text("user_agent"),
  viewportWidth: integer("viewport_width"),
  viewportHeight: integer("viewport_height"),
  // JSON array de data URLs base64 ("data:image/png;base64,...")
  screenshotsJson: text("screenshots_json"),
  status: text("status", { enum: ["new", "in_progress", "resolved"] })
    .notNull()
    .default("new"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  resolvedNote: text("resolved_note"),
});
