import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import type { NlpResult, SerpResult, Paa, HaloscanOverview } from "@/lib/analysis";
import { BriefEditor } from "@/app/app/briefs/[id]/brief-editor";

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

  const nlp = b.nlpJson ? (JSON.parse(b.nlpJson) as NlpResult) : null;
  const serp = b.serpJson ? (JSON.parse(b.serpJson) as SerpResult[]) : [];
  const paa = b.paaJson ? (JSON.parse(b.paaJson) as Paa[]) : [];
  const haloscan = b.haloscanJson ? (JSON.parse(b.haloscanJson) as HaloscanOverview) : null;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)] px-8 h-14 flex items-center justify-between shrink-0">
        <div className="ds-logo text-[var(--text)]">
          <div className="ds-logo-mark">
            <div className="sq sq1" />
            <div className="sq sq2" />
          </div>
          <span className="ds-logo-name">datafer</span>
        </div>
        <span className="inline-flex items-center gap-[5px] px-3 py-1 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[11px] font-semibold tracking-[0.4px]">
          Vue client
        </span>
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
          saveEndpoint={`/api/share-brief/${token}`}
          hideNewAnalysis
        />
      </div>
    </div>
  );
}
