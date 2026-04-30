import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { faviconUrl } from "@/lib/favicon";
import type { HaloscanOverview } from "@/lib/analysis";
import { listAllTags, listTagsForBriefs } from "@/lib/tags-service";
import type { WorkflowStatus } from "@/app/app/briefs/workflow-status";
import { SharedBriefList, type SharedBriefRow } from "./shared-brief-list";

export const dynamic = "force-dynamic";

export default async function SharedFolderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const [folder] = await db
    .select()
    .from(client)
    .where(eq(client.shareToken, token))
    .limit(1);

  if (!folder) notFound();

  const rows = await db
    .select({
      id: brief.id,
      keyword: brief.keyword,
      country: brief.country,
      score: brief.score,
      createdAt: brief.createdAt,
      volume: brief.volume,
      kgr: brief.kgr,
      position: brief.position,
      haloscanJson: brief.haloscanJson,
      workflowStatus: brief.workflowStatus,
    })
    .from(brief)
    .where(eq(brief.clientId, folder.id))
    .orderBy(desc(brief.createdAt));

  const [tagsByBrief, availableTags] = await Promise.all([
    listTagsForBriefs(rows.map((r) => r.id)),
    listAllTags(),
  ]);

  // KD (difficulty) n'a pas de colonne dédiée : on le lit depuis le snapshot
  // Haloscan stocké dans haloscanJson au moment de la création du brief.
  const briefs: SharedBriefRow[] = rows.map((b) => {
    let difficulty: number | null = null;
    if (b.haloscanJson) {
      try {
        const halo = JSON.parse(b.haloscanJson) as HaloscanOverview;
        difficulty = halo.difficulty ?? null;
      } catch {
        // snapshot malformé, on ignore
      }
    }
    return {
      id: b.id,
      keyword: b.keyword,
      country: b.country,
      score: b.score,
      createdAt: b.createdAt,
      volume: b.volume,
      kgr: b.kgr,
      position: b.position,
      difficulty,
      workflowStatus: b.workflowStatus as WorkflowStatus,
      tags: tagsByBrief.get(b.id) ?? [],
    };
  });

  const favicon = faviconUrl(folder.website, 48);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)] px-8 py-5 flex items-center justify-between">
        <div className="ds-logo text-[var(--text)]">
          <div className="ds-logo-mark">
            <div className="sq sq1" />
            <div className="sq sq2" />
          </div>
          <span className="ds-logo-name">datafer</span>
        </div>
        <span className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
          Vue client
        </span>
      </header>

      <div className="max-w-[1000px] mx-auto px-8 py-12">
        <div className="flex items-center gap-3 mb-4">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon}
              alt=""
              width={40}
              height={40}
              className="rounded-[var(--radius-xs)] bg-[var(--bg-warm)]"
            />
          ) : (
            <span className="w-10 h-10 rounded-[var(--radius-xs)] bg-[var(--bg-warm)]" />
          )}
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
            Client
          </span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[48px] leading-[1.05] tracking-[-1.2px] mb-2">
          {folder.name}
          <span className="italic text-[var(--accent-dark)]">.</span>
        </h1>
        {folder.website && (
          <p className="text-[13px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] mb-10">
            {folder.website}
          </p>
        )}

        {briefs.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-12 text-center">
            <p className="text-[13px] text-[var(--text-muted)]">
              Aucun brief pour ce client pour le moment.
            </p>
          </div>
        ) : (
          <SharedBriefList token={token} briefs={briefs} availableTags={availableTags} />
        )}

        <footer className="mt-14 text-center text-[11px] text-[var(--text-muted)]">
          Propulsé par <strong>datafer</strong> · datashake
        </footer>
      </div>
    </main>
  );
}
