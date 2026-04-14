import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client, user } from "@/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { PageHeader, EmptyState } from "../_ui";

export default async function AgencyFoldersPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const rows = await db
    .select({
      id: client.id,
      name: client.name,
      color: client.color,
      website: client.website,
      ownerName: user.name,
      briefCount: count(brief.id),
    })
    .from(client)
    .leftJoin(user, eq(user.id, client.ownerId))
    .leftJoin(brief, eq(brief.clientId, client.id))
    .where(eq(client.scope, "agency"))
    .groupBy(client.id)
    .orderBy(asc(client.name));

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={
          <>
            Dossiers <span className="italic text-[var(--accent-dark)]">datashake</span>
          </>
        }
        subtitle="Dossiers clients partagés par toute l'équipe Datashake. Visibles par tous les consultants."
        action={
          <Link
            href="/app/agency/new"
            className="inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-4 py-[9px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
          >
            + Nouveau dossier
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Aucun dossier datashake"
          description="Crée un dossier agence pour partager les briefs d'un client avec toute l'équipe."
          ctaLabel="Créer un dossier"
          ctaHref="/app/agency/new"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((f) => (
            <Link
              key={f.id}
              href={`/app/agency/${f.id}`}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: f.color || "var(--accent)" }}
                />
                <span className="font-semibold text-[14px] truncate">{f.name}</span>
              </div>
              {f.website && (
                <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate mb-3">
                  {f.website}
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)]">
                <span>{f.briefCount} {f.briefCount > 1 ? "briefs" : "brief"}</span>
                {f.ownerName && <span>par {f.ownerName}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
