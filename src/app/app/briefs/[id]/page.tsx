import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { PageHeader } from "../../_ui";

export default async function BriefDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const [row] = await db
    .select({ brief, folder: client })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(
      and(
        eq(brief.id, id),
        // Owner peut voir son brief, ou brief rattaché à un dossier agence
        or(eq(brief.ownerId, session.user.id), eq(client.scope, "agency")),
      ),
    )
    .limit(1);

  if (!row) notFound();

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase">
          {row.brief.country}
        </span>
        {row.folder && (
          <span className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
            · {row.folder.name}
          </span>
        )}
      </div>

      <PageHeader
        title={<>{row.brief.keyword}<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="L'éditeur WYSIWYG, le scoring NLP et l'analyse SERP arriveront dans la prochaine itération."
      />

      <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-12 text-center">
        <div className="font-semibold text-[14px] mb-1">Brief en cours de construction</div>
        <p className="text-[var(--text-secondary)] text-[13px] max-w-[420px] mx-auto">
          Cette page affichera l&apos;éditeur optimisé en temps réel, les scores par
          critère, le champ sémantique NLP, les benchmarks SERP et les insights Haloscan.
        </p>
      </div>
    </div>
  );
}
