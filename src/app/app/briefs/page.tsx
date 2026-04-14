import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, EmptyState } from "../_ui";

export default async function BriefsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const rows = await db
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
    .orderBy(desc(brief.createdAt));

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
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] px-5 py-3">Mot-clé</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] px-5 py-3">Pays</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] px-5 py-3">Dossier</th>
                <th className="text-right text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] px-5 py-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-warm)] transition-colors"
                >
                  <td className="px-5 py-3 text-[13px] font-medium">
                    <Link href={`/app/briefs/${b.id}`} className="hover:underline">
                      {b.keyword}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[12px] font-[family-name:var(--font-mono)] uppercase text-[var(--text-secondary)]">
                    {b.country}
                  </td>
                  <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">
                    {b.clientName ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-[12px] font-[family-name:var(--font-mono)] text-right">
                    {b.score != null ? `${b.score}/100` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
