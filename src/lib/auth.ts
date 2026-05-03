import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

function buildAuth() {
  const { env } = getCloudflareContext();
  const db = drizzle(env.DB as D1Database, { schema });

  // Fail-fast : sans secret, better-auth peut accepter une chaîne vide et
  // signer des sessions avec une clé prévisible. Préférable de cracher au
  // boot que de tourner avec une auth compromise. Rappel : le secret doit
  // être set sur le worker `datafer` ET sur `datafer-analysis-consumer`.
  const secret = (env as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET missing — set it via `wrangler secret put BETTER_AUTH_SECRET`");
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret,
    baseURL: (env as { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      // No public signup: accounts created via `npm run create-user`
      disableSignUp: true,
      autoSignIn: true,
    },
  });
}

let _auth: ReturnType<typeof buildAuth> | null = null;

export function getAuth() {
  if (!_auth) _auth = buildAuth();
  return _auth;
}
