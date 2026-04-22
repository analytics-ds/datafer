import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client, folderFavorite } from "@/db/schema";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { PageHeader, EmptyState } from "../_ui";
import { faviconUrl } from "@/lib/favicon";
import { SearchableFolderList } from "./searchable-folder-list";

export default async function FoldersPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const userId = session.user.id;
  const rows = await db
    .select({
      id: client.id,
      name: client.name,
      website: client.website,
      briefCount: count(brief.id),
      totalVolume: sql<number | null>`SUM(${brief.volume})`,
      positionedCount: sql<number>`SUM(CASE WHEN ${brief.position} IS NOT NULL THEN 1 ELSE 0 END)`,
      bestPosition: sql<number | null>`MIN(${brief.position})`,
      // Favorite per-user : 1 si une ligne existe dans folderFavorite, 0 sinon.
      isFavorite: sql<number>`MAX(CASE WHEN ${folderFavorite.userId} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(client)
    .leftJoin(brief, eq(brief.clientId, client.id))
    .leftJoin(
      folderFavorite,
      and(eq(folderFavorite.folderId, client.id), eq(folderFavorite.userId, userId)),
    )
    .groupBy(client.id)
    .orderBy(asc(client.name));

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={<>Tous les clients<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Tous les clients clients de l'agence, visibles par tous les consultants."
        action={
          <Link
            href="/app/folders/new"
            className="inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-4 py-[9px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
          >
            + Nouveau client
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Aucun client"
          description="Crée un client pour regrouper tes briefs."
          ctaLabel="Créer un client"
          ctaHref="/app/folders/new"
        />
      ) : (
        <SearchableFolderList folders={rows} />
      )}
    </div>
  );
}

// Conservé pour les autres écrans qui l'importent (folder detail, sidebar)
export function FolderFavicon({ website, size = 24 }: { website: string | null; size?: number }) {
  const src = faviconUrl(website, Math.max(size * 2, 32));
  if (!src) {
    return (
      <span
        className="rounded-[var(--radius-xs)] bg-[var(--bg-warm)] text-[var(--text-muted)] flex items-center justify-center text-[11px] shrink-0"
        style={{ width: size, height: size }}
      >
        ·
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-[var(--radius-xs)] bg-[var(--bg-warm)] shrink-0"
      loading="lazy"
    />
  );
}
