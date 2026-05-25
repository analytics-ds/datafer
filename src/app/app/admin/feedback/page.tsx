import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback as feedbackTable } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { PageHeader } from "../../_ui";
import { FeedbackList, type FeedbackRow } from "./feedback-list";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "pierre@datashake.fr";

export default async function AdminFeedbackPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  // Page admin gated : seul Pierre y accède pour l'instant. Si on doit
  // ouvrir à plus de consultants un jour, ajouter un rôle dans la table user
  // et checker ici. 404 plutôt que 403 pour ne pas révéler l'existence.
  if (session.user.email.toLowerCase() !== ADMIN_EMAIL) notFound();

  const db = getDb();
  const rows = await db
    .select()
    .from(feedbackTable)
    .orderBy(desc(feedbackTable.createdAt));

  const feedbacks: FeedbackRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.userEmail,
    userName: r.userName,
    category: r.category,
    message: r.message,
    url: r.url,
    userAgent: r.userAgent,
    viewportWidth: r.viewportWidth,
    viewportHeight: r.viewportHeight,
    screenshots: r.screenshotsJson ? (JSON.parse(r.screenshotsJson) as string[]) : [],
    status: r.status,
    createdAt: r.createdAt.getTime(),
    resolvedAt: r.resolvedAt?.getTime() ?? null,
    resolvedNote: r.resolvedNote,
  }));

  const stats = {
    total: feedbacks.length,
    new: feedbacks.filter((f) => f.status === "new").length,
    inProgress: feedbacks.filter((f) => f.status === "in_progress").length,
    resolved: feedbacks.filter((f) => f.status === "resolved").length,
    bug: feedbacks.filter((f) => f.category === "bug").length,
    suggestion: feedbacks.filter((f) => f.category === "suggestion").length,
    question: feedbacks.filter((f) => f.category === "question").length,
  };

  return (
    <div className="px-10 py-10 max-w-[1100px]">
      <PageHeader
        title={<>Feedback<span className="df-accent">.</span></>}
        subtitle="Les retours envoyés par les consultants depuis le widget en bas à droite."
      />

      {feedbacks.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-12 text-center">
          <div className="font-semibold text-[14px] mb-1">Aucun feedback pour l&apos;instant</div>
          <p className="text-[var(--text-secondary)] text-[13px]">
            Les messages des consultants apparaîtront ici dès qu&apos;ils utiliseront le widget.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Nouveaux" value={stats.new} highlight={stats.new > 0} />
            <StatCard label="En cours" value={stats.inProgress} />
            <StatCard label="Résolus" value={stats.resolved} muted />
          </div>
          <FeedbackList feedbacks={feedbacks} />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight, muted }: { label: string; value: number; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[2px]">
        {label}
      </div>
      <div
        className="font-[family-name:var(--font-display)] text-[28px] leading-none tabular-nums tracking-[-0.6px]"
        style={{
          color: highlight ? "var(--accent-dark)" : muted ? "var(--text-muted)" : "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
