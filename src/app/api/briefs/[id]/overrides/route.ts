import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import type { BriefOverrides } from "@/lib/brief-overrides";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/briefs/[id]/overrides
 *
 * Mise à jour des overrides back-office sur un brief :
 * - position du domaine du dossier (override manuel)
 * - word count min/max/avg de référence
 * - URLs des concurrents top 10 à exclure des calculs
 * - termes NLP à masquer
 *
 * Pas exposé via le scope partage : seuls les utilisateurs authentifiés
 * (back-office) peuvent appeler cet endpoint. La data brute SERP/Haloscan
 * reste intacte ; les overrides sont mergés au runtime côté page Next.js.
 *
 * Body : objet BriefOverrides partiel. Les champs absents conservent leur
 * valeur précédente. Pour réinitialiser un champ, passer `null` (position)
 * ou tableau vide / undefined.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as BriefOverrides | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const db = getDb();

  const [row] = await db
    .select({ id: brief.id, overridesJson: brief.overridesJson })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Merge partiel : on conserve les champs précédents non renvoyés.
  const previous: BriefOverrides = row.overridesJson
    ? (() => {
        try {
          return JSON.parse(row.overridesJson) as BriefOverrides;
        } catch {
          return {};
        }
      })()
    : {};

  const next: BriefOverrides = { ...previous };

  if ("position" in body) {
    if (body.position === null) {
      delete next.position;
    } else if (typeof body.position === "number" && Number.isFinite(body.position)) {
      next.position = Math.max(1, Math.floor(body.position));
    } else {
      return NextResponse.json({ error: "bad position" }, { status: 400 });
    }
  }

  if ("wordCount" in body) {
    if (body.wordCount === undefined || body.wordCount === null) {
      delete next.wordCount;
    } else if (typeof body.wordCount === "object") {
      const wc: { min?: number; max?: number; avg?: number } = {};
      for (const k of ["min", "max", "avg"] as const) {
        const v = body.wordCount[k];
        if (v === undefined) continue;
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
          return NextResponse.json({ error: `bad wordCount.${k}` }, { status: 400 });
        }
        wc[k] = Math.max(0, Math.floor(v));
      }
      next.wordCount = wc;
    } else {
      return NextResponse.json({ error: "bad wordCount" }, { status: 400 });
    }
  }

  if ("disabledCompetitors" in body) {
    if (!Array.isArray(body.disabledCompetitors)) {
      return NextResponse.json({ error: "bad disabledCompetitors" }, { status: 400 });
    }
    next.disabledCompetitors = body.disabledCompetitors.filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );
  }

  if ("nlpTermsRemoved" in body) {
    if (!Array.isArray(body.nlpTermsRemoved)) {
      return NextResponse.json({ error: "bad nlpTermsRemoved" }, { status: 400 });
    }
    next.nlpTermsRemoved = body.nlpTermsRemoved.filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );
  }

  // Sérialise compactement pour ne pas gonfler la BDD si tous les champs
  // sont à leur défaut (objet vide → null).
  const hasAny =
    next.position !== undefined ||
    (next.wordCount && Object.keys(next.wordCount).length > 0) ||
    (next.disabledCompetitors && next.disabledCompetitors.length > 0) ||
    (next.nlpTermsRemoved && next.nlpTermsRemoved.length > 0);

  await db
    .update(brief)
    .set({
      overridesJson: hasAny ? JSON.stringify(next) : null,
      updatedAt: new Date(),
    })
    .where(eq(brief.id, id));

  return NextResponse.json({ ok: true, overrides: next });
}
