import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import type { NlpResult, SerpResult, Paa, HaloscanOverview } from "@/lib/analysis";
import { BriefEditor } from "@/app/app/briefs/[id]/brief-editor";
import { applyBriefOverrides, parseBriefOverrides } from "@/lib/brief-overrides";
import { listTagsForBrief, listTagsForClient } from "@/lib/tags-service";
import type { WorkflowStatus } from "@/app/app/briefs/workflow-status";
import { LogoApp } from "@/components/brand";
import { LocaleProvider } from "@/lib/i18n/context";
import { resolveLocale } from "@/lib/i18n/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export const dynamic = "force-dynamic";

export default async function SharedSingleBriefPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = getDb();

  const [row] = await db
    .select({ brief, folder: client })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(eq(brief.shareToken, token))
    .limit(1);

  if (!row) notFound();
  const b = row.brief;
  const folder = row.folder;

  // Mêmes overrides back-office que la vue consultant (termes ajoutés ou
  // masqués, concurrents désactivés, longueur cible) : sans eux, le client
  // scorait sur une autre liste de termes et voyait un autre score.
  const rawNlp = b.nlpJson ? (JSON.parse(b.nlpJson) as NlpResult) : null;
  const rawSerp = b.serpJson ? (JSON.parse(b.serpJson) as SerpResult[]) : [];
  const overridden = applyBriefOverrides(
    { nlp: rawNlp, serp: rawSerp, position: b.position ?? null },
    parseBriefOverrides(b.overridesJson),
  );
  const nlp = overridden.nlp;
  const serp = overridden.serp;
  const paa = b.paaJson ? (JSON.parse(b.paaJson) as Paa[]) : [];
  const haloscan = b.haloscanJson ? (JSON.parse(b.haloscanJson) as HaloscanOverview) : null;

  const [initialTags, availableTags] = await Promise.all([
    listTagsForBrief(b.id),
    b.clientId ? listTagsForClient(b.clientId) : Promise.resolve([]),
  ]);

  const locale = await resolveLocale(folder?.locale);

  return (
    <LocaleProvider locale={locale}>
      <div className="min-h-screen bg-[var(--bg)] flex flex-col">
        <header className="bg-[var(--bg-card)] border-b border-[var(--border)] px-8 h-14 flex items-center justify-between shrink-0">
          <LogoApp height={20} className="text-[var(--text)]" />
          <LocaleSwitcher />
        </header>

        <div className="flex-1 flex flex-col">
          <BriefEditor
            id={b.id}
            keyword={b.keyword}
            country={b.country}
            folder={
              folder
                ? { id: folder.id, name: folder.name, website: folder.website, scope: folder.scope }
                : null
            }
            initialHtml={b.editorHtml ?? ""}
            nlp={nlp}
            serp={serp}
            paa={paa}
            haloscan={haloscan}
            position={overridden.position}
            positionUrl={b.positionUrl ?? null}
            workflowStatus={b.workflowStatus as WorkflowStatus}
            initialTags={initialTags}
            availableTags={availableTags}
            semanticEndpoint={`/api/share-brief/${token}/semantic`}
            initialScore={b.score ?? null}
            saveEndpoint={`/api/share-brief/${token}`}
            tagsEndpoint={`/api/share-brief/${token}/tags`}
            tagsCreateEndpoint={`/api/share-brief/${token}/tags-create`}
            exportEndpoint={`/api/share-brief/${token}/export`}
            maillageEndpoint={`/api/share-brief/${token}/maillage`}
            printUrl={`/api/share-brief/${token}/print`}
            commentsEndpoint={`/api/share-brief/${token}/comments`}
            commentAuthor={{ type: "client", name: folder?.name?.trim() || "Client" }}
            hideNewAnalysis
          />
        </div>
      </div>
    </LocaleProvider>
  );
}
