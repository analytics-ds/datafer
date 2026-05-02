import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

import { getDb } from "@/db";
import { brief, client, user } from "@/db/schema";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { PageHeader, SectionTitle, EmptyState } from "./_ui";
import { BriefCard } from "./briefs/brief-card";
import { FolderFavicon } from "./folders/page";
import { listAllTags, listTagsForBriefs } from "@/lib/tags-service";
import type { WorkflowStatus } from "./briefs/workflow-status";

export default async function AppHome() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const startOfMonth = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

  const [recentBriefs, foldersWithCount, availableTags, monthStats, totalStats] = await Promise.all([
    db
      .select({
        id: brief.id,
        keyword: brief.keyword,
        country: brief.country,
        score: brief.score,
        createdAt: brief.createdAt,
        clientId: brief.clientId,
        folderName: client.name,
        folderWebsite: client.website,
        authorId: user.id,
        authorName: user.name,
        authorImage: user.image,
        volume: brief.volume,
        competition: brief.competition,
        kgr: brief.kgr,
        position: brief.position,
        workflowStatus: brief.workflowStatus,
      })
      .from(brief)
      .leftJoin(client, eq(client.id, brief.clientId))
      .leftJoin(user, eq(user.id, brief.ownerId))
      .orderBy(desc(brief.createdAt))
      .limit(8),
    db
      .select({
        id: client.id,
        name: client.name,
        website: client.website,
        scope: client.scope,
        briefCount: sql<number>`COUNT(${brief.id})`,
        lastBriefAt: sql<number | null>`MAX(${brief.createdAt})`,
      })
      .from(client)
      .leftJoin(brief, eq(brief.clientId, client.id))
      .groupBy(client.id)
      .orderBy(desc(sql`MAX(${brief.createdAt})`), asc(client.name)),
    listAllTags(),
    db
      .select({
        briefsThisMonth: sql<number>`COUNT(*)`,
        avgScoreThisMonth: sql<number | null>`AVG(${brief.score})`,
      })
      .from(brief)
      .where(and(gte(brief.createdAt, new Date(startOfMonth * 1000)), eq(brief.status, "ready"))),
    db
      .select({
        briefsTotal: sql<number>`COUNT(*)`,
      })
      .from(brief),
  ]);

  const tagsByBrief = await listTagsForBriefs(recentBriefs.map((b) => b.id));
  const briefsThisMonth = monthStats[0]?.briefsThisMonth ?? 0;
  const avgScoreThisMonth = Math.round(monthStats[0]?.avgScoreThisMonth ?? 0);
  const briefsTotal = totalStats[0]?.briefsTotal ?? 0;
  const clientsActive = foldersWithCount.filter((f) => f.briefCount > 0).length;

  // Pour passer aux BriefCard (qui s'attend à un type folder unique)
  const folders = foldersWithCount.map((f) => ({ id: f.id, name: f.name, website: f.website }));

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={<>Bonjour <span className="italic text-[var(--accent-dark)]">{session.user.name.split(" ")[0]}.</span></>}
        subtitle="Reprends un brief en cours, démarre une nouvelle analyse ou ajoute un client."
      />

      {/* Action bar : 2 grandes cartes côte à côte */}
      <section className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-3 mb-10">
        <Link
          href="/app/briefs/new"
          className="group flex items-center justify-between bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius)] px-7 py-6 hover:bg-[var(--bg-dark)] transition-colors"
        >
          <div>
            <div className="text-[11px] font-semibold tracking-[0.8px] uppercase text-[var(--bg-olive-light)] mb-[2px]">
              Content Optimizer
            </div>
            <div className="font-[family-name:var(--font-display)] text-[28px] leading-tight">
              Démarrer un nouveau brief
            </div>
          </div>
          <span className="text-[15px] group-hover:translate-x-1 transition-transform">→</span>
        </Link>
        <Link
          href="/app/folders/new"
          className="group flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] px-7 py-6 hover:border-[var(--border-strong)] hover:bg-[var(--bg-warm)] transition-colors"
        >
          <div>
            <div className="text-[11px] font-semibold tracking-[0.8px] uppercase text-[var(--text-muted)] mb-[2px]">
              Dossier client
            </div>
            <div className="font-[family-name:var(--font-display)] text-[24px] leading-tight">
              Nouveau client
            </div>
          </div>
          <span className="text-[15px] text-[var(--text-muted)] group-hover:translate-x-1 transition-transform">+</span>
        </Link>
      </section>

      {/* Stats du mois */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
        <StatCard label="Briefs ce mois" value={briefsThisMonth.toString()} accent="var(--accent)" />
        <StatCard label="Score moyen" value={avgScoreThisMonth > 0 ? `${avgScoreThisMonth}/100` : "—"} accent="var(--green)" />
        <StatCard label="Briefs total" value={briefsTotal.toString()} accent="var(--purple)" />
        <StatCard label="Clients actifs" value={`${clientsActive}/${foldersWithCount.length}`} accent="#E85D3A" />
      </section>

      {/* Tes clients */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Tes clients</SectionTitle>
          {foldersWithCount.length > 0 && (
            <Link href="/app/folders" className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] font-semibold">
              Voir tous →
            </Link>
          )}
        </div>
        {foldersWithCount.length === 0 ? (
          <EmptyState
            title="Aucun client pour l'instant"
            description="Crée ton premier dossier client pour organiser tes briefs."
            ctaLabel="Nouveau client"
            ctaHref="/app/folders/new"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {foldersWithCount.slice(0, 6).map((f) => (
              <Link
                key={f.id}
                href={`/app/folders/${f.id}`}
                className="group flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-3 hover:border-[var(--border-strong)] hover:bg-[var(--bg-warm)] transition-colors"
              >
                <FolderFavicon website={f.website} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] truncate flex items-center gap-2">
                    {f.name}
                    {f.scope === "agency" && (
                      <span className="text-[9px] uppercase tracking-[0.5px] px-[5px] py-[1px] rounded-[var(--radius-pill)] bg-[var(--bg-olive-light)] text-[var(--accent-dark)]">
                        agence
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                    {f.briefCount} brief{f.briefCount > 1 ? "s" : ""}
                  </div>
                </div>
                <span className="text-[12px] text-[var(--text-muted)] group-hover:translate-x-[2px] transition-transform">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Briefs récents */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Briefs récents</SectionTitle>
          {recentBriefs.length > 0 && (
            <Link href="/app/briefs" className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] font-semibold">
              Voir tous →
            </Link>
          )}
        </div>
        {recentBriefs.length === 0 ? (
          <EmptyState
            title="Aucun brief pour l'instant"
            description="Ton premier brief apparaîtra ici. Lance une analyse pour commencer."
            ctaLabel="Créer un brief"
            ctaHref="/app/briefs/new"
          />
        ) : (
          <div className="grid gap-2">
            {recentBriefs.map((b) => (
              <BriefCard
                key={b.id}
                folders={folders}
                availableTags={availableTags}
                brief={{
                  id: b.id,
                  keyword: b.keyword,
                  country: b.country,
                  score: b.score,
                  createdAt: b.createdAt,
                  volume: b.volume,
                  competition: b.competition,
                  kgr: b.kgr,
                  position: b.position,
                  workflowStatus: b.workflowStatus as WorkflowStatus,
                  tags: tagsByBrief.get(b.id) ?? [],
                  folder: b.clientId
                    ? { id: b.clientId, name: b.folderName ?? "", website: b.folderWebsite }
                    : null,
                  author: b.authorId
                    ? { id: b.authorId, name: b.authorName, image: b.authorImage }
                    : null,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: accent }} />
      <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-2">
        {label}
      </div>
      <div className="font-[family-name:var(--font-display)] text-[28px] leading-none tracking-[-0.5px]">
        {value}
      </div>
    </div>
  );
}
