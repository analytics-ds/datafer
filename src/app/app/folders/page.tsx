import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { PageHeader, EmptyState } from "../_ui";
import { faviconUrl } from "@/lib/favicon";
import { FolderListCard } from "./folder-list-card";

export default async function FoldersPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const rows = await db
    .select({
      id: client.id,
      name: client.name,
      website: client.website,
      briefCount: count(brief.id),
    })
    .from(client)
    .leftJoin(brief, eq(brief.clientId, client.id))
    .groupBy(client.id)
    .orderBy(asc(client.name));

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={<>Tous les dossiers<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Tous les dossiers clients de l'agence, visibles par tous les consultants."
        action={
          <Link
            href="/app/folders/new"
            className="inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-4 py-[9px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
          >
            + Nouveau dossier
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Aucun dossier"
          description="Crée un dossier pour regrouper tes briefs par client."
          ctaLabel="Créer un dossier"
          ctaHref="/app/folders/new"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((f) => (
            <FolderListCard key={f.id} folder={f} />
          ))}
        </div>
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
