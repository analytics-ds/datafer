import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NlpResult, SerpResult, Paa, HaloscanOverview } from "@/lib/analysis";
import { ensureCompetitorScores } from "@/lib/scoring";
import { applyBriefOverrides, parseBriefOverrides } from "@/lib/brief-overrides";
import { BriefEditor } from "./brief-editor";
import { listTagsForBrief, listTagsForClient } from "@/lib/tags-service";
import type { WorkflowStatus } from "../workflow-status";

export default async function BriefDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const db = getDb();
  const [row] = await db
    .select({ brief, folder: client })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(eq(brief.id, id))
    .limit(1);

  if (!row) notFound();

  const b = row.brief;
  const rawNlp = b.nlpJson ? (JSON.parse(b.nlpJson) as NlpResult) : null;
  const rawSerp = b.serpJson ? (JSON.parse(b.serpJson) as SerpResult[]) : [];
  const overrides = parseBriefOverrides(b.overridesJson);
  // Applique les overrides back-office (Paramètres du brief). Filtre les
  // concurrents désactivés du SERP, retire les termes NLP masqués, override
  // position et word count min/max/avg.
  const overridden = applyBriefOverrides(
    { nlp: rawNlp, serp: rawSerp, position: b.position ?? null },
    overrides,
  );
  const nlp = overridden.nlp;
  const serp = overridden.serp;
  // Lazy backfill des scores concurrents pour les briefs antérieurs à
  // l'itération 7. Mutation in-memory ; la persistance D1 a lieu au
  // prochain save (rescoreBrief sérialise le NlpResult complet). Avec
  // overrides : on re-scoring sur le serp filtré (competitorScores a été
  // invalidé par applyBriefOverrides).
  if (nlp) ensureCompetitorScores(nlp, JSON.stringify(serp));
  const paa = b.paaJson ? (JSON.parse(b.paaJson) as Paa[]) : [];
  const haloscan = b.haloscanJson ? (JSON.parse(b.haloscanJson) as HaloscanOverview) : null;

  const [initialTags, availableTags] = await Promise.all([
    listTagsForBrief(b.id),
    // Tags scopés au client du brief : impossible d'attacher un tag d'un
    // autre client. Si le brief n'a pas de client, pas de tags possibles.
    b.clientId ? listTagsForClient(b.clientId) : Promise.resolve([]),
  ]);

  return (
    <BriefEditor
      id={b.id}
      keyword={b.keyword}
      country={b.country}
      folder={
        row.folder
          ? {
              id: row.folder.id,
              name: row.folder.name,
              website: row.folder.website,
              scope: row.folder.scope,
            }
          : null
      }
      initialHtml={b.editorHtml ?? ""}
      nlp={nlp}
      serp={serp}
      paa={paa}
      haloscan={haloscan}
      position={overridden.position}
      shareToken={b.shareToken ?? null}
      overrides={overrides}
      rawSerp={rawSerp}
      rawNlpTerms={rawNlp?.nlpTerms ?? []}
      workflowStatus={b.workflowStatus as WorkflowStatus}
      initialTags={initialTags}
      availableTags={availableTags}
    />
  );
}
