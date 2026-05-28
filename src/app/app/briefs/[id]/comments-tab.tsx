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
    <div className="px-8 py-6">
      <div className="mb-4 flex items-center gap-2">
        <FilterBtn active={filter === "open"} onClick={() => setFilter("open")}>
          Actifs <span className="opacity-70">({counts.open})</span>
        </FilterBtn>
        <FilterBtn active={filter === "resolved"} onClick={() => setFilter("resolved")}>
          Résolus <span className="opacity-70">({counts.resolved})</span>
        </FilterBtn>
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
          Tous <span className="opacity-70">({counts.total})</span>
        </FilterBtn>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          {filter === "open"
            ? "Aucun commentaire actif pour le moment. Surligne du texte dans l'éditeur pour en ajouter un."
            : filter === "resolved"
              ? "Aucun commentaire résolu."
              : "Aucun commentaire."}
        </p>
      )}

      <ul className="space-y-4">
        {filtered.map((t) => (
          <li
            key={t.anchorId}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
          >
            <button
              type="button"
              onClick={() => onJumpToAnchor(t.anchorId)}
              className="mb-3 block w-full rounded border-l-[3px] border-amber-400 bg-amber-50 px-3 py-1.5 text-left text-[12px] italic text-[var(--text-muted)] hover:bg-amber-100"
              title="Aller à l'ancre dans l'éditeur"
            >
              {truncate(t.anchorText, 240)}
            </button>

            {[t.root, ...t.replies].map((c) => (
              <div
                key={c.id}
                className="border-b border-[var(--border)] py-2 last:border-b-0"
              >
                <div className="flex items-baseline gap-2">
                  <strong className="text-sm">{c.authorName}</strong>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {formatDateFull(c.createdAt)}
                  </span>
                  {c.authorType === "client" && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-900">
                      client
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                {canEdit(c) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Supprimer ce commentaire ?")) remove(c.id);
                    }}
                    className="mt-1 text-[11px] text-red-700 hover:underline"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            ))}

            {t.resolved && t.root.resolvedByName && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Résolu par {t.root.resolvedByName} · {formatDateFull(t.root.resolvedAt!)}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => patch(t.root.id, { resolved: !t.resolved })}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[12px] hover:bg-[var(--bg-soft)]"
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
                  className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[12px] hover:bg-[var(--bg-soft)]"
                >
                  Répondre
                </button>
              )}
            </div>

            {replyTo === t.root.id && (
              <div className="mt-2">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Ta réponse…"
                  rows={2}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] p-2 text-sm"
                />
                <div className="mt-1 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-[12px]"
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
                    className="rounded-md bg-amber-500 px-3 py-1 text-[12px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    Répondre
                  </button>
                </div>
              </div>
            )}
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
        "rounded-md border px-3 py-1 text-[12px] transition-colors " +
        (active
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-soft)]")
      }
    >
      {children}
    </button>
  );
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
