/**
 * Create a user account directly in the D1 database.
 *
 * Usage:
 *   npm run create-user -- --email pierre@datashake.fr --password '…' --name 'Pierre'
 *   npm run create-user -- --email … --password … --local
 *
 * Requires `wrangler` authenticated. Writes to the remote D1 by default;
 * pass --local to write to the local dev database.
 *
 * The password is hashed with the exact same scrypt parameters as
 * @better-auth/utils/password (N=16384, r=16, p=1, dkLen=64, NFKC-normalised
 * password, hex-encoded salt, "salt:key" output format). Verified against the
 * source at node_modules/@better-auth/utils/dist/password.node.mjs.
 */

import { execSync } from "node:child_process";
import { randomUUID, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

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

async function hashPassword(password: string): Promise<string> {
  const N = 16384, r = 16, p = 1, dkLen = 64;
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password.normalize("NFKC"), salt, dkLen, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  })) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  const args = parseArgs();
  const email = args.email;
  const password = args.password;
  const name = args.name ?? email?.split("@")[0] ?? "User";
  const mode = args.local === "true" ? "--local" : "--remote";

  if (!email || !password) {
    console.error(
      "Usage: npm run create-user -- --email <email> --password <pwd> [--name <name>] [--local]",
    );
    process.exit(1);
  }

  const userId = randomUUID();
  const accountId = randomUUID();
  const hash = await hashPassword(password);
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
}

main();
