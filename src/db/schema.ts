import { sqliteTable, text, integer, real, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

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
  // Statut éditorial du brief, distinct du `status` technique ci-dessus.
  // 'in_progress' = en cours de rédaction
  // 'drafted'     = rédigé (relecture / validation)
  // 'published'   = publié en ligne
  workflowStatus: text("workflow_status", { enum: ["in_progress", "drafted", "published"] })
    .notNull()
    .default("in_progress"),
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
