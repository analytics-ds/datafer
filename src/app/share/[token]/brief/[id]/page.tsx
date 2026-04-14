import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { faviconUrl } from "@/lib/favicon";

export const dynamic = "force-dynamic";

export default async function SharedBriefPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const db = getDb();

  const [row] = await db
    .select({ brief, folder: client })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(and(eq(brief.id, id), eq(client.shareToken, token)))
    .limit(1);

  if (!row) notFound();
  const b = row.brief;
  const folder = row.folder;

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)] px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="ds-logo text-[var(--text)]">
            <div className="ds-logo-mark">
              <div className="sq sq1" />
              <div className="sq sq2" />
            </div>
            <span className="ds-logo-name">datafer</span>
          </div>
          {folder && (
            <>
              <div className="w-px h-6 bg-[var(--border)]" />
              <Link
                href={`/share/${token}`}
                className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text)]"
              >
                {folder.website && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={faviconUrl(folder.website, 32) ?? ""} alt="" width={16} height={16} className="rounded-[3px]" />
                )}
                ← {folder.name}
              </Link>
            </>
          )}
        </div>
        <span className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
          Vue client · lecture seule
        </span>
      </header>

      <div className="max-w-[900px] mx-auto px-8 py-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase">
            {b.country}
          </span>
          <ScoreChip score={b.score ?? 0} />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[42px] leading-[1.05] tracking-[-1px] mb-8">
          {b.keyword}<span className="italic text-[var(--accent-dark)]">.</span>
        </h1>

        {b.editorHtml && b.editorHtml.trim().length > 0 ? (
          <article
            className="shared-article bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] px-10 py-8"
            dangerouslySetInnerHTML={{ __html: b.editorHtml }}
          />
        ) : (
          <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-12 text-center">
            <p className="text-[13px] text-[var(--text-muted)]">
              Ce brief est encore en préparation.
            </p>
          </div>
        )}

        <footer className="mt-14 text-center text-[11px] text-[var(--text-muted)]">
          Propulsé par <strong>datafer</strong> · datashake
        </footer>
      </div>

      <style>{`
        .shared-article { font-size: 16px; line-height: 1.8; color: var(--text); }
        .shared-article h1 {
          font-family: var(--font-display), Georgia, serif;
          font-size: 32px; font-weight: 400; letter-spacing: -0.8px;
          margin: 24px 0 12px; padding-bottom: 8px;
          border-bottom: 2px solid var(--bg-olive-light);
        }
        .shared-article h2 { font-size: 22px; font-weight: 700; margin: 24px 0 10px; }
        .shared-article h3 { font-size: 17px; font-weight: 600; margin: 18px 0 6px; color: var(--text-secondary); }
        .shared-article p { margin-bottom: 14px; }
        .shared-article ul, .shared-article ol { margin: 10px 0 14px 24px; }
        .shared-article li { margin-bottom: 6px; }
        .shared-article img { max-width: 100%; height: auto; border-radius: var(--radius-sm); margin: 14px 0; }
        .shared-article a { color: var(--accent-dark); text-decoration: underline; }
        .shared-article table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
        .shared-article th, .shared-article td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
        .shared-article th { background: var(--bg-warm); font-weight: 600; }
      `}</style>
    </main>
  );
}

function ScoreChip({ score }: { score: number }) {
  const color = score < 40 ? "var(--red)" : score < 70 ? "var(--orange)" : "var(--green)";
  const bg = score < 40 ? "var(--red-bg)" : score < 70 ? "var(--orange-bg)" : "var(--green-bg)";
  return (
    <span
      className="px-2 py-[3px] rounded-[var(--radius-pill)] text-[11px] font-semibold font-[family-name:var(--font-mono)]"
      style={{ background: bg, color }}
    >
      Score {score}/100
    </span>
  );
}
