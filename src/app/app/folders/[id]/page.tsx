import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader, EmptyState } from "../../_ui";

export default async function FolderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const [folder] = await db
    .select()
    .from(client)
    .where(
      and(
        eq(client.id, id),
        eq(client.ownerId, session.user.id),
        eq(client.scope, "personal"),
      ),
    )
    .limit(1);

  if (!folder) notFound();

  const briefs = await db
    .select({
      id: brief.id,
      keyword: brief.keyword,
      country: brief.country,
      score: brief.score,
      createdAt: brief.createdAt,
    })
    .from(brief)
    .where(eq(brief.clientId, folder.id))
    .orderBy(desc(brief.createdAt));

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-4 h-4 rounded-full shrink-0"
          style={{ background: folder.color || "var(--accent)" }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
          Mon dossier
        </span>
      </div>

      <PageHeader
        title={<>{folder.name}<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle={folder.website ?? undefined}
        action={
          <Link
            href={`/app/briefs/new?folder=${folder.id}`}
            className="inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-4 py-[9px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
          >
            + Nouveau brief
          </Link>
        }
      />

      {briefs.length === 0 ? (
        <EmptyState
          title="Aucun brief dans ce dossier"
          description="Crée un brief et assigne-le à ce dossier pour le retrouver ici."
          ctaLabel="Nouveau brief"
          ctaHref={`/app/briefs/new?folder=${folder.id}`}
        />
      ) : (
        <div className="grid gap-3">
          {briefs.map((b) => (
            <Link
              key={b.id}
              href={`/app/briefs/${b.id}`}
              className="flex items-center gap-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-5 py-4 hover:border-[var(--border-strong)] transition-colors"
            >
              <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase">
                {b.country}
              </span>
              <div className="flex-1 font-semibold text-[14px] truncate">{b.keyword}</div>
              <div className="text-[12px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)]">
                {b.score != null ? `${b.score}/100` : "—"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
