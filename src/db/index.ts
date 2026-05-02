import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB as D1Database, { schema });
}

/**
 * Variante qui prend l'env explicitement, pour les contextes hors OpenNext
 * (queue consumer worker dédié à l'analyse).
 */
export function getDbFromEnv(env: { DB: D1Database }) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
