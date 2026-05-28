"use client";

import { useMemo, useState } from "react";
import type { CommentAuthor, CommentDTO } from "./comment-layer-types";

type Thread = {
  anchorId: string;
  anchorText: string;
  root: CommentDTO;
  replies: CommentDTO[];
  resolved: boolean;
};

type Props = {
  comments: CommentDTO[];
  author: CommentAuthor;
  editorRef: React.RefObject<HTMLDivElement | null>;
  patch: (
    commentId: string,
    changes: { body?: string; resolved?: boolean },
  ) => Promise<CommentDTO | null>;
  remove: (
    commentId: string,
  ) => Promise<{ ok: boolean; threadDeleted: boolean; anchorId?: string }>;
  reply: (input: {
    anchorId: string;
    anchorText: string;
    parentId: string;
    body: string;
  }) => Promise<CommentDTO | null>;
  /** Pour qu'un click sur un thread aille révéler l'ancre dans l'éditeur. */
  onJumpToAnchor: (anchorId: string) => void;
};

export function CommentsTab({
  comments,
  author,
  patch,
  remove,
  reply,
  onJumpToAnchor,
}: Props) {
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const threads = useMemo<Thread[]>(() => {
    const byAnchor = new Map<string, CommentDTO[]>();
    for (const c of comments) {
      const arr = byAnchor.get(c.anchorId) ?? [];
      arr.push(c);
      byAnchor.set(c.anchorId, arr);
    }
    const result: Thread[] = [];
    for (const [anchorId, arr] of byAnchor.entries()) {
      arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const root = arr.find((c) => !c.parentId);
      if (!root) continue;
      result.push({
        anchorId,
        anchorText: root.anchorText,
        root,
        replies: arr.filter((c) => c.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        resolved: !!root.resolvedAt,
      });
    }
    result.sort((a, b) => b.root.createdAt.localeCompare(a.root.createdAt));
    return result;
  }, [comments]);

  const filtered = threads.filter((t) =>
    filter === "open" ? !t.resolved : filter === "resolved" ? t.resolved : true,
  );

  const counts = useMemo(() => {
    const open = threads.filter((t) => !t.resolved).length;
    const resolved = threads.filter((t) => t.resolved).length;
    return { open, resolved, total: threads.length };
  }, [threads]);

  const canEdit = (c: CommentDTO) =>
    (author.type === "user" && c.authorType === "user") ||
    (author.type === "client" && c.authorType === "client" && c.authorName === author.name);

  return (
    <div className="mx-auto max-w-[820px] px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-semibold leading-tight">Commentaires</h2>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            {counts.open} actif{counts.open > 1 ? "s" : ""} · {counts.resolved} résolu{counts.resolved > 1 ? "s" : ""}
          </p>
        </div>
        <div className="inline-flex rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-sm)]">
          <FilterBtn active={filter === "open"} onClick={() => setFilter("open")}>
            Actifs <span className="ml-1 opacity-70">{counts.open}</span>
          </FilterBtn>
          <FilterBtn active={filter === "resolved"} onClick={() => setFilter("resolved")}>
            Résolus <span className="ml-1 opacity-70">{counts.resolved}</span>
          </FilterBtn>
          <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
            Tous <span className="ml-1 opacity-70">{counts.total}</span>
          </FilterBtn>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--bg-warm)] px-6 py-10 text-center">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-card)] text-[18px] shadow-[var(--shadow-sm)]">
            💬
          </div>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {filter === "open"
              ? "Aucun commentaire actif. Surligne du texte dans l'éditeur pour en ajouter un."
              : filter === "resolved"
                ? "Aucun commentaire résolu."
                : "Aucun commentaire sur ce brief."}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {filtered.map((t) => (
          <li
            key={t.anchorId}
            className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow)]"
          >
            <button
              type="button"
              onClick={() => onJumpToAnchor(t.anchorId)}
              className="block w-full border-b border-[var(--border)] bg-[var(--bg-warm)] px-5 py-3 text-left text-[12.5px] italic text-[var(--text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-warm))]"
              title="Aller à l'ancre dans l'éditeur"
            >
              <span className="mr-2 inline-block h-3 w-[3px] -mb-px align-middle bg-[var(--accent)]" />
              {truncate(t.anchorText, 240)}
            </button>

            <div className="px-5 pb-4 pt-3">
              <div className="space-y-3">
                {[t.root, ...t.replies].map((c) => (
                  <div key={c.id} className="flex items-start gap-3 group">
                    <span
                      className={
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase tracking-wide " +
                        (c.authorType === "client"
                          ? "bg-[var(--bg-warm)] text-[var(--accent-dark)] ring-1 ring-[var(--border-strong)]"
                          : "bg-[var(--bg-olive-light)] text-[var(--accent-dark)]")
                      }
                      style={{ fontFamily: "var(--font-mono)" }}
                      aria-hidden
                    >
                      {initialsOf(c.authorName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <strong className="text-[13px] font-semibold text-[var(--text)]">
                          {c.authorName}
                        </strong>
                        <span
                          className="text-[10.5px] text-[var(--text-muted)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {formatDateFull(c.createdAt)}
                        </span>
                        {c.authorType === "client" && (
                          <span className="rounded-full bg-[var(--bg-olive-light)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-[var(--accent-dark)]">
                            client
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[var(--text)]">
                        {c.body}
                      </p>
                      {canEdit(c) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Supprimer ce commentaire ?")) remove(c.id);
                          }}
                          className="mt-1 text-[10.5px] font-semibold text-[var(--red)] opacity-0 transition-opacity hover:underline group-hover:opacity-100"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {t.resolved && t.root.resolvedByName && (
                <p
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--green-bg)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--green)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  ✓ Résolu par {t.root.resolvedByName} · {formatDateFull(t.root.resolvedAt!)}
                </p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patch(t.root.id, { resolved: !t.resolved })}
                  className="rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-warm)] hover:border-[var(--border-strong)]"
                >
                  {t.resolved ? "Rouvrir" : "Résoudre"}
                </button>
                {!t.resolved && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(replyTo === t.root.id ? null : t.root.id);
                      setReplyBody("");
                    }}
                    className="rounded-[var(--radius-xs)] bg-[var(--bg-black)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--bg-dark)]"
                  >
                    Répondre
                  </button>
                )}
              </div>

              {replyTo === t.root.id && (
                <div className="mt-3 rounded-[var(--radius-xs)] bg-[var(--bg-warm)] p-3">
                  <textarea
                    autoFocus
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Ta réponse…"
                    rows={2}
                    className="w-full rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[13px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--bg-warm)]"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={!replyBody.trim()}
                      onClick={async () => {
                        await reply({
                          anchorId: t.anchorId,
                          anchorText: t.anchorText,
                          parentId: t.root.id,
                          body: replyBody.trim(),
                        });
                        setReplyTo(null);
                        setReplyBody("");
                      }}
                      className="rounded-[var(--radius-xs)] bg-[var(--bg-black)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-inverse)] hover:bg-[var(--bg-dark)] disabled:cursor-not-allowed disabled:bg-[var(--border-strong)]"
                    >
                      Répondre
                    </button>
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-[var(--radius-pill)] px-3 py-1 text-[11.5px] font-semibold transition-colors " +
        (active
          ? "bg-[var(--bg-black)] text-[var(--text-inverse)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-warm)]")
      }
    >
      {children}
    </button>
  );
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function formatDateFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
