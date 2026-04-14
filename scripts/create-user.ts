/**
 * Create a user account directly in the remote D1 database.
 *
 * Usage:
 *   npm run create-user -- --email pierre@datashake.fr --password '…' --name 'Pierre'
 *
 * Requires:
 *   - `wrangler` authenticated (`wrangler login`)
 *   - The D1 database "datafer" configured in wrangler.toml with database_id set.
 *
 * How it works: since better-auth is initialized per-request inside the Worker,
 * this script talks to a deployed endpoint OR, if --local is passed, writes
 * directly to the local D1 SQLite file via wrangler d1 execute.
 *
 * For the MVP we shell out to wrangler d1 execute with a SQL insert that
 * matches better-auth's schema. Password hashing is done here with scrypt
 * (same algo better-auth uses by default).
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { scryptSync, randomBytes } from "node:crypto";

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = "true";
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

// Better-auth stores passwords as `scrypt:<N>:<r>:<p>:<salt-hex>:<hash-hex>`
// by default. We replicate that here.
function hashPassword(password: string): string {
  const N = 16384, r = 8, p = 1, keyLen = 64;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, keyLen, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

const args = parseArgs();
const email = args.email;
const password = args.password;
const name = args.name ?? email?.split("@")[0] ?? "User";
const mode = args.local === "true" ? "--local" : "--remote";

if (!email || !password) {
  console.error("Usage: npm run create-user -- --email <email> --password <pwd> [--name <name>] [--local]");
  process.exit(1);
}

const userId = randomUUID();
const accountId = randomUUID();
const hash = hashPassword(password);
const now = Math.floor(Date.now() / 1000);

const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
VALUES ('${userId}', '${sqlEscape(name)}', '${sqlEscape(email)}', 1, ${now}, ${now});

INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
VALUES ('${accountId}', '${userId}', '${sqlEscape(email)}', 'credential', '${hash}', ${now}, ${now});
`.trim();

try {
  execSync(
    `wrangler d1 execute datafer ${mode} --command "${sql.replace(/"/g, '\\"')}"`,
    { stdio: "inherit" },
  );
  console.log(`\nUser created: ${email} (${userId})`);
} catch {
  console.error("Failed to create user. Make sure wrangler is authenticated and D1 is set up.");
  process.exit(1);
}
