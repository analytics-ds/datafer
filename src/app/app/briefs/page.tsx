import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client, user } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { PageHeader, EmptyState } from "../_ui";
import { SearchableBriefList } from "./searchable-brief-list";

export default async function BriefsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();

  const [rows, folders] = await Promise.all([
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
      .orderBy(desc(brief.createdAt)),
    db
      .select({ id: client.id, name: client.name, website: client.website })
      .from(client)
      .orderBy(asc(client.name)),
  ]);

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={<>Tous les briefs<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Historique complet de tes analyses sémantiques."
        action={
          <Link
            href="/app/briefs/new"
            className="inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-4 py-[9px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
          >
            + Nouveau brief
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Aucun brief"
          description="Crée ton premier brief pour démarrer une analyse sémantique."
          ctaLabel="Nouveau brief"
          ctaHref="/app/briefs/new"
        />
      ) : (
        <SearchableBriefList
          folders={folders}
          briefs={rows.map((b) => ({
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
          }))}
        />
      )}
    </div>
  );
}
