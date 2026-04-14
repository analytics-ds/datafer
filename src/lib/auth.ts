import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

function buildAuth() {
  const { env } = getCloudflareContext();
  const db = drizzle(env.DB as D1Database, { schema });

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
    secret: (env as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET,
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
