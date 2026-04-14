import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { and, asc, count, eq } from "drizzle-orm";
import { PageHeader, EmptyState } from "../_ui";
import { faviconUrl } from "@/lib/favicon";

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
    .where(and(eq(client.ownerId, session.user.id), eq(client.scope, "personal")))
    .groupBy(client.id)
    .orderBy(asc(client.name));

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={<>Mes dossiers<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Organise tes briefs par client ou par projet perso."
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
            <Link
              key={f.id}
              href={`/app/folders/${f.id}`}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <FolderFavicon website={f.website} size={28} />
                <span className="font-semibold text-[14px] truncate">{f.name}</span>
              </div>
              {f.website && (
                <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate mb-3">
                  {f.website}
                </div>
              )}
              <div className="text-[11px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)]">
                {f.briefCount} {f.briefCount > 1 ? "briefs" : "brief"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
