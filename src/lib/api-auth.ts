import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { apiKey } from "@/db/schema";

const PREFIX = "dfk_";

export async function generateApiKey(): Promise<{ raw: string; prefix: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const raw = `${PREFIX}${body}`;
  const prefix = raw.slice(0, 12);
  const hash = await sha256(raw);
  return { raw, prefix, hash };
}

export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type AuthedUser = { id: string; email: string };

export async function resolveUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const raw = authHeader.slice(7).trim();
    if (!raw.startsWith(PREFIX)) return null;
    const hash = await sha256(raw);
    const db = getDb();
    const [row] = await db
      .select({ id: apiKey.id, userId: apiKey.userId })
      .from(apiKey)
      .where(and(eq(apiKey.keyHash, hash), isNull(apiKey.revokedAt)))
      .limit(1);
    if (!row) return null;
    try {
      await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, row.id));
    } catch {}
    return { id: row.userId, email: "" };
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email };
}

export function newApiKeyId(): string {
  return randomUUID();
}
