import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client, user } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { PageHeader, SectionTitle, EmptyState } from "./_ui";
import { BriefCard } from "./briefs/brief-card";

export default async function AppHome() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();

  const [recentBriefs, folders] = await Promise.all([
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
      })
      .from(brief)
      .leftJoin(client, eq(client.id, brief.clientId))
      .leftJoin(user, eq(user.id, brief.ownerId))
      .orderBy(desc(brief.createdAt))
      .limit(10),
    db
      .select({ id: client.id, name: client.name, website: client.website })
      .from(client)
      .orderBy(asc(client.name)),
  ]);

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
          <div className="grid gap-2">
            {recentBriefs.map((b) => (
              <BriefCard
                key={b.id}
                folders={folders}
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
