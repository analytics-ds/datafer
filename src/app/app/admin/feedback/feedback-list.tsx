"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteFeedback, updateFeedbackStatus } from "./actions";

export type FeedbackRow = {
  id: string;
  userId: string | null;
  userEmail: string;
  userName: string;
  category: "bug" | "suggestion" | "question";
  message: string;
  url: string;
  userAgent: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  screenshots: string[];
  status: "new" | "in_progress" | "resolved";
  createdAt: number;
  resolvedAt: number | null;
  resolvedNote: string | null;
};

const CATEGORY_META: Record<FeedbackRow["category"], { label: string; emoji: string; color: string; bg: string }> = {
  bug: { label: "Bug", emoji: "🐛", color: "var(--red)", bg: "var(--red-bg)" },
  suggestion: { label: "Suggestion", emoji: "💡", color: "var(--accent-dark)", bg: "var(--bg-olive-light)" },
  question: { label: "Question", emoji: "❓", color: "var(--blue)", bg: "var(--blue-bg)" },
};

const STATUS_META: Record<FeedbackRow["status"], { label: string; color: string }> = {
  new: { label: "Nouveau", color: "var(--accent-dark)" },
  in_progress: { label: "En cours", color: "var(--orange)" },
  resolved: { label: "Résolu", color: "var(--green)" },
};

export function FeedbackList({ feedbacks }: { feedbacks: FeedbackRow[] }) {
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackRow["status"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeedbackRow["category"]>("all");

  const filtered = useMemo(
    () =>
      feedbacks.filter(
        (f) =>
          (statusFilter === "all" || f.status === statusFilter) &&
          (categoryFilter === "all" || f.category === categoryFilter),
      ),
    [feedbacks, statusFilter, categoryFilter],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterChip
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          Tous statuts
        </FilterChip>
        {(Object.keys(STATUS_META) as Array<FeedbackRow["status"]>).map((s) => (
          <FilterChip
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            color={STATUS_META[s].color}
          >
            {STATUS_META[s].label}
          </FilterChip>
        ))}
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
          Toutes catégories
        </FilterChip>
        {(Object.keys(CATEGORY_META) as Array<FeedbackRow["category"]>).map((c) => (
          <FilterChip
            key={c}
            active={categoryFilter === c}
            onClick={() => setCategoryFilter(c)}
          >
            {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[var(--text-muted)]">
          Aucun feedback ne correspond à ces filtres.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((f) => (
            <FeedbackCard key={f.id} feedback={f} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-[5px] rounded-[var(--radius-pill)] text-[11px] font-semibold border transition-colors ${
        active
          ? "bg-[var(--bg-black)] text-[var(--text-inverse)] border-[var(--bg-black)]"
          : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      }`}
      style={active && color ? { background: color, borderColor: color } : undefined}
    >
      {children}
    </button>
  );
}

function FeedbackCard({ feedback }: { feedback: FeedbackRow }) {
  const [expanded, setExpanded] = useState(feedback.status === "new");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cat = CATEGORY_META[feedback.category];
  const status = STATUS_META[feedback.status];

  function setStatus(s: FeedbackRow["status"]) {
    startTransition(async () => {
      await updateFeedbackStatus(feedback.id, s);
    });
  }

  function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    startTransition(async () => {
      await deleteFeedback(feedback.id);
    });
  }

  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden transition-shadow hover:shadow-[var(--shadow-sm)]"
      style={{ opacity: feedback.status === "resolved" ? 0.75 : 1 }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left"
      >
        <span
          className="w-[34px] h-[34px] rounded-[var(--radius-xs)] flex items-center justify-center text-[16px] shrink-0"
          style={{ background: cat.bg }}
        >
          {cat.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-[2px]">
            <span className="font-semibold text-[13px]">{feedback.userName}</span>
            <span
              className="px-[7px] py-[1px] rounded-[var(--radius-pill)] text-[9px] font-bold uppercase tracking-[0.5px]"
              style={{ color: status.color, background: `${status.color}1A` }}
            >
              {status.label}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
              {formatDate(feedback.createdAt)}
            </span>
          </div>
          <div className="text-[12px] text-[var(--text-secondary)] line-clamp-1">{feedback.message}</div>
        </div>
        <span className="text-[var(--text-muted)] shrink-0">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[12px]">
            <Meta label="Email" value={feedback.userEmail} mono />
            <Meta
              label="Page"
              value={
                <a href={feedback.url} target="_blank" rel="noreferrer" className="text-[var(--accent-dark)] hover:underline break-all font-[family-name:var(--font-mono)] text-[11px]">
                  {shortPath(feedback.url)}
                </a>
              }
            />
            {feedback.viewportWidth && feedback.viewportHeight && (
              <Meta label="Viewport" value={`${feedback.viewportWidth} × ${feedback.viewportHeight}`} mono />
            )}
            {feedback.userAgent && <Meta label="User-Agent" value={feedback.userAgent} mono small />}
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[5px]">
            Message
          </div>
          <div className="bg-[var(--bg-warm)] border border-[var(--border)] rounded-[var(--radius-xs)] px-4 py-3 text-[13px] leading-[1.55] whitespace-pre-wrap mb-4">
            {feedback.message}
          </div>

          {feedback.screenshots.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[5px]">
                Captures d&apos;écran ({feedback.screenshots.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {feedback.screenshots.map((src, i) => (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-[var(--border)] rounded-[var(--radius-xs)] overflow-hidden hover:border-[var(--border-strong)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="w-full max-h-[280px] object-contain bg-[var(--bg)]" />
                  </a>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
            {(Object.keys(STATUS_META) as Array<FeedbackRow["status"]>).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                disabled={pending || feedback.status === s}
                className={`px-3 py-[6px] rounded-[var(--radius-sm)] text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                  feedback.status === s
                    ? "border-[var(--bg-black)] bg-[var(--bg-black)] text-[var(--text-inverse)] cursor-default"
                    : "border-[var(--border)] hover:bg-[var(--bg-warm)] hover:border-[var(--border-strong)]"
                }`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
            <div className="flex-1" />
            <a
              href={`mailto:${feedback.userEmail}?subject=Re%3A%20Ton%20feedback%20Rankshake`}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text)] font-semibold"
            >
              Répondre par mail
            </a>
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="text-[11px] text-[var(--red)] hover:bg-[var(--red-bg)] px-2 py-[5px] rounded-[var(--radius-xs)] font-semibold disabled:opacity-50"
            >
              {confirmDelete ? "Confirmer ?" : "Supprimer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value, mono, small }: { label: string; value: React.ReactNode; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[2px]">
        {label}
      </div>
      <div
        className={`break-all ${mono ? "font-[family-name:var(--font-mono)]" : ""} ${
          small ? "text-[10px] text-[var(--text-muted)]" : "text-[12px]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diffM = Math.floor((now - ms) / 60_000);
  if (diffM < 1) return "à l'instant";
  if (diffM < 60) return `il y a ${diffM} min`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
