import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { faviconUrl } from "@/lib/favicon";
import type { NlpResult, SerpResult, Paa, HaloscanOverview } from "@/lib/analysis";
import { BriefEditor } from "@/app/app/briefs/[id]/brief-editor";

export const dynamic = "force-dynamic";

export default async function SharedBriefPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const db = getDb();

  const [row] = await db
    .select({ brief, folder: client })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(and(eq(brief.id, id), eq(client.shareToken, token)))
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
        <div className="flex items-center gap-4">
          <div className="ds-logo text-[var(--text)]">
            <div className="ds-logo-mark">
              <div className="sq sq1" />
              <div className="sq sq2" />
            </div>
            <span className="ds-logo-name">datafer</span>
          </div>
          {folder && (
            <>
              <div className="w-px h-6 bg-[var(--border)]" />
              <Link
                href={`/share/${token}`}
                className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text)]"
              >
                {folder.website && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={faviconUrl(folder.website, 32) ?? ""}
                    alt=""
                    width={16}
                    height={16}
                    className="rounded-[3px]"
                  />
                )}
                ← {folder.name}
              </Link>
            </>
          )}
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
              ? {
                  id: folder.id,
                  name: folder.name,
                  website: folder.website,
                  scope: folder.scope,
                }
              : null
          }
          initialHtml={b.editorHtml ?? ""}
          nlp={nlp}
          serp={serp}
          paa={paa}
          haloscan={haloscan}
          position={b.position ?? null}
          saveEndpoint={`/api/share/${token}/briefs/${b.id}`}
          hideNewAnalysis
        />
      </div>
    </div>
  );
}
