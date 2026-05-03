import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
  if (!session) redirect("/login");

  const db = getDb();
  const startOfMonth = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

  const [recentBriefs, foldersWithCount, availableTags, leaderboard] = await Promise.all([
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
        analysisStatus: brief.status,
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
    // Classement de l'équipe : briefs créés ce mois par user, avec leur photo.
    db
      .select({
        userId: user.id,
        name: user.name,
        firstName: user.firstName,
        image: user.image,
        count: sql<number>`COUNT(${brief.id})`,
      })
      .from(user)
      .leftJoin(
        brief,
        and(eq(brief.ownerId, user.id), gte(brief.createdAt, new Date(startOfMonth * 1000))),
      )
      .groupBy(user.id)
      .orderBy(desc(sql`COUNT(${brief.id})`), asc(user.name)),
  ]);

  const tagsByBrief = await listTagsForBriefs(recentBriefs.map((b) => b.id));
  // Thomas demandé caché du leaderboard et exclu du total équipe (sinon
  // le pourcentage serait incohérent). Filtre par prénom : si plusieurs
  // Thomas arrivent un jour, on raffinera par email/id.
  const visibleLeaderboard = leaderboard.filter(
    (u) => (u.firstName ?? u.name).split(" ")[0].toLowerCase() !== "thomas",
  );
  const myBriefsThisMonth =
    visibleLeaderboard.find((u) => u.userId === session.user.id)?.count ?? 0;
  const totalBriefsThisMonth = visibleLeaderboard.reduce((s, u) => s + Number(u.count), 0);
  const myShare = totalBriefsThisMonth > 0 ? myBriefsThisMonth / totalBriefsThisMonth : 0;

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

      {/* Stats du mois : donut + leaderboard équipe */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-3 mb-12">
        <ShareDonut share={myShare} />
        <Leaderboard
          users={visibleLeaderboard.map((u) => ({
            id: u.userId,
            name: u.name,
            firstName: u.firstName,
            image: u.image,
            count: Number(u.count),
            isMe: u.userId === session.user.id,
          }))}
        />
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
                  analysisStatus: b.analysisStatus as "pending" | "ready" | "failed",
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

function ShareDonut({ share }: { share: number }) {
  const R = 90;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - share);
  const pct = Math.round(share * 100);
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-6 flex items-center justify-center">
      <div className="relative w-[220px] h-[220px]">
        <svg viewBox="0 0 220 220" className="w-full h-full -rotate-90">
          <circle cx="110" cy="110" r={R} fill="none" stroke="var(--border)" strokeWidth="22" />
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            stroke="var(--accent-dark)"
            strokeWidth="22"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset .6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-[family-name:var(--font-display)] text-[52px] leading-none tracking-[-1px]">{pct}%</span>
          <span className="text-[9px] uppercase tracking-[1px] text-[var(--text-muted)] mt-2">de l&apos;équipe</span>
        </div>
      </div>
    </div>
  );
}

function Leaderboard({
  users,
}: {
  users: { id: string; name: string; firstName: string | null; image: string | null; count: number; isMe: boolean }[];
}) {
  const top = users.slice(0, 5);
  const max = Math.max(1, ...top.map((u) => u.count));
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-4">
        Classement de l&apos;équipe ce mois
      </div>
      {top.length === 0 || top.every((u) => u.count === 0) ? (
        <div className="text-[12px] text-[var(--text-muted)] italic">Aucun brief créé ce mois pour l&apos;instant.</div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {top.map((u, i) => {
            const display = u.firstName || u.name.split(" ")[0] || "?";
            const pct = u.count > 0 ? (u.count / max) * 100 : 0;
            return (
              <div
                key={u.id}
                className={`flex items-center gap-3 ${u.isMe ? "" : ""}`}
              >
                <div className="text-[11px] font-[family-name:var(--font-mono)] text-[var(--text-muted)] w-[16px] shrink-0">
                  {i + 1}.
                </div>
                <Avatar image={u.image} name={display} isMe={u.isMe} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] truncate ${u.isMe ? "font-bold" : "font-medium"}`}>
                    {display}{u.isMe ? " (toi)" : ""}
                  </div>
                  <div className="h-[4px] bg-[var(--bg)] rounded-full mt-[3px] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: u.isMe ? "var(--accent-dark)" : "var(--accent)",
                      }}
                    />
                  </div>
                </div>
                <div className={`font-[family-name:var(--font-mono)] text-[14px] tabular-nums w-[36px] text-right ${u.isMe ? "font-bold text-[var(--text)]" : "text-[var(--text-secondary)]"}`}>
                  {u.count}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Avatar({ image, name, isMe }: { image: string | null; name: string; isMe: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={`w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold shrink-0 ${
        isMe ? "ring-2 ring-[var(--accent-dark)] ring-offset-2 ring-offset-[var(--bg-card)]" : ""
      }`}
      style={{ background: image ? "transparent" : "var(--bg-olive-light)", color: "var(--accent-dark)" }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
