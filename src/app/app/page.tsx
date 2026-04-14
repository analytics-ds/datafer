import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, SectionTitle, EmptyState } from "./_ui";

export default async function AppHome() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();

  const recentBriefs = await db
    .select({
      id: brief.id,
      keyword: brief.keyword,
      country: brief.country,
      score: brief.score,
      clientName: client.name,
      createdAt: brief.createdAt,
    })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(eq(brief.ownerId, session.user.id))
    .orderBy(desc(brief.createdAt))
    .limit(10);

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={<>Bonjour <span className="italic text-[var(--accent-dark)]">{session.user.name.split(" ")[0]}.</span></>}
        subtitle="Reprends un brief en cours ou démarre une nouvelle analyse sémantique."
      />

      <section className="mb-12">
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
      </section>

      <section>
        <SectionTitle>Briefs récents</SectionTitle>
        {recentBriefs.length === 0 ? (
          <EmptyState
            title="Aucun brief pour l'instant"
            description="Ton premier brief apparaîtra ici. Lance une analyse pour commencer."
            ctaLabel="Créer un brief"
            ctaHref="/app/briefs/new"
          />
        ) : (
          <div className="grid gap-3">
            {recentBriefs.map((b) => (
              <Link
                key={b.id}
                href={`/app/briefs/${b.id}`}
                className="flex items-center gap-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-5 py-4 hover:border-[var(--border-strong)] transition-colors"
              >
                <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase">
                  {b.country}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] truncate">{b.keyword}</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                    {b.clientName ?? "Sans dossier"}
                  </div>
                </div>
                <div className="text-[12px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)]">
                  {b.score != null ? `${b.score}/100` : "—"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

