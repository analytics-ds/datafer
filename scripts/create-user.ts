/**
 * Create a user account directly in the D1 database.
 *
 * Usage:
 *   npm run create-user -- --email pierre@datashake.fr --first-name Pierre --last-name Gaudard
 *   # password defaults to "1234" and mustChangePassword is set; the user will
 *   # be forced to change it on first login.
 *
 *   npm run create-user -- --email … --first-name … --last-name … --password custom --no-force-change
 *   npm run create-user -- --email … --first-name … --last-name … --local
 *
 * Password hashing matches @better-auth/utils/password.node.mjs exactly:
 *   scrypt N=16384, r=16, p=1, dkLen=64; NFKC-normalised password;
 *   hex-encoded 16-byte salt; "<salt_hex>:<key_hex>" output.
 */

import { execSync } from "node:child_process";
import { randomUUID, randomBytes, scrypt } from "node:crypto";

function scryptAsync(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

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
  const key = await scryptAsync(password.normalize("NFKC"), salt, dkLen, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  });
  return `${salt}:${key.toString("hex")}`;
}

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  const args = parseArgs();
  const email = args.email;
  const firstName = args["first-name"] ?? args.firstName;
  const lastName = args["last-name"] ?? args.lastName;
  const password = args.password ?? "1234";
  const forceChange = args["no-force-change"] !== "true";
  const mode = args.local === "true" ? "--local" : "--remote";

  if (!email) {
    console.error(
      "Usage: npm run create-user -- --email <email> --first-name <first> --last-name <last> [--password <pwd>] [--no-force-change] [--local]",
    );
    process.exit(1);
  }

  const name = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
  const userId = randomUUID();
  const accountId = randomUUID();
  const hash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const mustChange = forceChange ? 1 : 0;

  const sql = `
INSERT INTO user (id, name, first_name, last_name, email, email_verified, must_change_password, created_at, updated_at)
VALUES ('${userId}', '${sqlEscape(name)}', ${firstName ? `'${sqlEscape(firstName)}'` : "NULL"}, ${lastName ? `'${sqlEscape(lastName)}'` : "NULL"}, '${sqlEscape(email)}', 1, ${mustChange}, ${now}, ${now});

INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
VALUES ('${accountId}', '${userId}', '${sqlEscape(email)}', 'credential', '${hash}', ${now}, ${now});
`.trim();

  try {
    execSync(
      `wrangler d1 execute datafer ${mode} --command "${sql.replace(/"/g, '\\"')}"`,
      { stdio: "inherit" },
    );
    console.log(`\nUser created: ${email} (${userId})`);
    console.log(`  Password:  ${password}${forceChange ? "  (must be changed on first login)" : ""}`);
  } catch {
    console.error("Failed to create user. Make sure wrangler is authenticated and D1 is set up.");
    process.exit(1);
  }
}

main();
