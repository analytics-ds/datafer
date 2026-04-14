import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { faviconUrl } from "@/lib/favicon";
import { relativeDate } from "@/lib/relative-date";

export const dynamic = "force-dynamic";

export default async function SharedFolderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const [folder] = await db
    .select()
    .from(client)
    .where(eq(client.shareToken, token))
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

  const favicon = faviconUrl(folder.website, 48);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)] px-8 py-5 flex items-center justify-between">
        <div className="ds-logo text-[var(--text)]">
          <div className="ds-logo-mark">
            <div className="sq sq1" />
            <div className="sq sq2" />
          </div>
          <span className="ds-logo-name">datafer</span>
        </div>
        <span className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
          Vue client · lecture seule
        </span>
      </header>

      <div className="max-w-[1000px] mx-auto px-8 py-12">
        <div className="flex items-center gap-3 mb-4">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favicon} alt="" width={40} height={40} className="rounded-[var(--radius-xs)] bg-[var(--bg-warm)]" />
          ) : (
            <span className="w-10 h-10 rounded-[var(--radius-xs)] bg-[var(--bg-warm)]" />
          )}
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
            Dossier client
          </span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[48px] leading-[1.05] tracking-[-1.2px] mb-2">
          {folder.name}<span className="italic text-[var(--accent-dark)]">.</span>
        </h1>
        {folder.website && (
          <p className="text-[13px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] mb-10">
            {folder.website}
          </p>
        )}

        {briefs.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-12 text-center">
            <p className="text-[13px] text-[var(--text-muted)]">
              Aucun brief dans ce dossier pour le moment.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {briefs.map((b) => (
              <Link
                key={b.id}
                href={`/share/${token}/brief/${b.id}`}
                className="group grid grid-cols-[64px_1fr_auto] items-center gap-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] px-5 py-4 hover:border-[var(--border-strong)] transition-colors"
              >
                <ScoreGauge score={b.score ?? 0} />
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight truncate">{b.keyword}</div>
                  <div className="text-[12px] text-[var(--text-secondary)] mt-1 font-[family-name:var(--font-mono)] uppercase">
                    {b.country}
                  </div>
                </div>
                <span className="text-[12px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                  {relativeDate(b.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        )}

        <footer className="mt-14 text-center text-[11px] text-[var(--text-muted)]">
          Propulsé par <strong>datafer</strong> · datashake
        </footer>
      </div>
    </main>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = score < 40 ? "var(--red)" : score < 70 ? "var(--orange)" : "var(--green)";
  const r = 24;
  const length = Math.PI * r;
  const offset = length - (Math.max(0, Math.min(100, score)) / 100) * length;
  return (
    <div className="relative w-[56px] h-[38px]">
      <svg viewBox="0 0 56 38" className="w-full h-full">
        <path d={`M 4 34 A ${r} ${r} 0 0 1 52 34`} fill="none" stroke="var(--border)" strokeWidth="4.5" strokeLinecap="round" />
        <path d={`M 4 34 A ${r} ${r} 0 0 1 52 34`} fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-[1px] font-[family-name:var(--font-mono)] font-semibold text-[13px]" style={{ color }}>
        {score}
      </div>
    </div>
  );
}
