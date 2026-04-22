import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client, folderFavorite, user } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { PageHeader, EmptyState } from "../../_ui";
import { FolderFavicon } from "../page";
import { FavoriteButton } from "../favorite-button";
import { SharePanel } from "../share-panel";
import { DeleteFolderButton } from "../delete-folder";
import { BriefCard } from "../../briefs/brief-card";

export default async function FolderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const [row] = await db
    .select({ folder: client })
    .from(client)
    .where(eq(client.id, id))
    .limit(1);

  if (!row) notFound();
  const folder = row.folder;

  const [fav] = await db
    .select()
    .from(folderFavorite)
    .where(and(eq(folderFavorite.userId, session.user.id), eq(folderFavorite.folderId, folder.id)))
    .limit(1);

  const [briefs, folders] = await Promise.all([
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
      .where(eq(brief.clientId, folder.id))
      .orderBy(desc(brief.createdAt)),
    db
      .select({ id: client.id, name: client.name, website: client.website })
      .from(client)
      .orderBy(asc(client.name)),
  ]);

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <div className="flex items-center gap-2 mb-3">
        <FolderFavicon website={folder.website} size={24} />
        <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
          Client
        </span>
      </div>

      <PageHeader
        title={<>{folder.name}<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle={folder.website ?? undefined}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <FavoriteButton folderId={folder.id} initialFavorited={!!fav} />
            <SharePanel folderId={folder.id} initialToken={folder.shareToken ?? null} />
            <DeleteFolderButton
              folderId={folder.id}
              folderName={folder.name}
              folderWebsite={folder.website}
            />
            <Link
              href={`/app/briefs/new?folder=${folder.id}`}
              className="inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-4 py-[9px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
            >
              + Nouveau brief
            </Link>
          </div>
        }
      />

      {briefs.length === 0 ? (
        <EmptyState
          title="Aucun brief pour ce client"
          description="Crée un brief et assigne-le à ce client pour le retrouver ici."
          ctaLabel="Nouveau brief"
          ctaHref={`/app/briefs/new?folder=${folder.id}`}
        />
      ) : (
        <div className="grid gap-2">
          {briefs.map((b) => (
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
    </div>
  );
}
