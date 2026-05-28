"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Couche de commentaires inline « façon Google Docs » au-dessus du
 * contentEditable de l'éditeur de brief. Le composant ne possède pas
 * l'éditeur : il reçoit `editorRef` et :
 *   - écoute les sélections de texte pour proposer un bouton « 💬 »
 *   - injecte/lit les ancres `<span data-comment-id="…">` dans innerHTML
 *   - fetch + render les threads dans un popover ancré sur la sélection
 *   - persiste via les endpoints `commentsEndpoint` (back-office OU share).
 */

export type CommentDTO = {
  id: string;
  briefId: string;
  anchorId: string;
  anchorText: string;
  parentId: string | null;
  authorType: "user" | "client";
  authorId: string | null;
  authorName: string;
  body: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommentAuthor =
  | { type: "user"; name: string }
  | { type: "client"; name: string };

type Props = {
  editorRef: React.RefObject<HTMLDivElement | null>;
  /** Garantit la persistance de l'editorHtml après ajout/résolution d'ancres. */
  saveEditorHtml: () => void;
  /** Endpoint REST : back-office = `/api/briefs/<id>/comments`, share = `/api/share-brief/<token>/comments`. */
  commentsEndpoint: string;
  /** Identité de l'auteur courant. Côté share = client; côté back-office = user identifié. */
  author: CommentAuthor;
  /**
   * Si vrai, on demande au client de saisir son prénom au 1er commentaire.
   * Utilisé sur le partage public où on ne connaît pas l'auteur a priori.
   */
  needsClientNameSetup?: boolean;
  /** Appelé quand le client saisit son prénom (côté share). */
  onClientNameChange?: (name: string) => void;
};

type DraftState =
  | { kind: "idle" }
  | { kind: "new"; anchorId: string; anchorText: string; rect: DOMRect }
  | { kind: "thread"; anchorId: string; rect: DOMRect };

const ANCHOR_CLASS = "df-comment-anchor";
const ANCHOR_RESOLVED_CLASS = "df-comment-anchor-resolved";
const ANCHOR_ACTIVE_CLASS = "df-comment-anchor-active";

export function CommentLayer({
  editorRef,
  saveEditorHtml,
  commentsEndpoint,
  author,
  needsClientNameSetup,
  onClientNameChange,
}: Props) {
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" });
  const [selectionBtn, setSelectionBtn] = useState<{
    rect: DOMRect;
    text: string;
    range: Range;
  } | null>(null);
  const [clientName, setClientName] = useState(author.type === "client" ? author.name : "");

  // Fetch initial des comments + refresh sur reload de l'éditeur.
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(commentsEndpoint, { cache: "no-store" });
      if (r.ok) {
        const data = (await r.json()) as { comments: CommentDTO[] };
        setComments(data.comments);
      }
    } finally {
      setLoading(false);
    }
  }, [commentsEndpoint]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Index par anchorId pour le rendu et la résolution.
  const byAnchor = useMemo(() => {
    const m = new Map<string, CommentDTO[]>();
    for (const c of comments) {
      const arr = m.get(c.anchorId) ?? [];
      arr.push(c);
      m.set(c.anchorId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return m;
  }, [comments]);

  // Au mount + à chaque update de comments, applique la classe "resolved"
  // sur les ancres dont TOUS les root + replies sont résolus, sinon retire.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const anchors = el.querySelectorAll<HTMLSpanElement>(`span.${ANCHOR_CLASS}[data-comment-id]`);
    anchors.forEach((span) => {
      const aid = span.dataset.commentId;
      if (!aid) return;
      const thread = byAnchor.get(aid);
      if (!thread || thread.length === 0) {
        // Anchor sans commentaire (sans doute supprimé) : on déballe le span.
        unwrapSpan(span);
        return;
      }
      const root = thread.find((c) => !c.parentId);
      const resolved = !!root?.resolvedAt;
      span.classList.toggle(ANCHOR_RESOLVED_CLASS, resolved);
    });
  }, [byAnchor, editorRef]);

  // Detection des sélections : on écoute mouseup et keyup sur le contentEditable.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelectionBtn(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) {
        setSelectionBtn(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 2) {
        setSelectionBtn(null);
        return;
      }
      // Si la sélection chevauche déjà une ancre, on n'affiche pas le bouton.
      if (rangeIntersectsAnchor(range, el)) {
        setSelectionBtn(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelectionBtn({ rect, text, range: range.cloneRange() });
    };
    document.addEventListener("mouseup", onSelection);
    document.addEventListener("keyup", onSelection);
    document.addEventListener("selectionchange", onSelection);
    return () => {
      document.removeEventListener("mouseup", onSelection);
      document.removeEventListener("keyup", onSelection);
      document.removeEventListener("selectionchange", onSelection);
    };
  }, [editorRef]);

  // Click sur une ancre existante → ouvre le thread.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const span = target?.closest<HTMLSpanElement>(`span.${ANCHOR_CLASS}[data-comment-id]`);
      if (!span) return;
      e.preventDefault();
      const aid = span.dataset.commentId;
      if (!aid) return;
      const rect = span.getBoundingClientRect();
      setSelectionBtn(null);
      setDraft({ kind: "thread", anchorId: aid, rect });
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [editorRef]);

  // Highlight visuel : on toggle la classe "active" sur l'ancre du draft.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.querySelectorAll(`.${ANCHOR_ACTIVE_CLASS}`).forEach((n) => n.classList.remove(ANCHOR_ACTIVE_CLASS));
    if (draft.kind === "thread" || draft.kind === "new") {
      const span = el.querySelector<HTMLSpanElement>(
        `span.${ANCHOR_CLASS}[data-comment-id="${cssEscape(draft.anchorId)}"]`,
      );
      span?.classList.add(ANCHOR_ACTIVE_CLASS);
    }
  }, [draft, editorRef]);

  const startNewComment = useCallback(() => {
    if (!selectionBtn) return;
    if (author.type === "client" && needsClientNameSetup && !clientName.trim()) {
      const name = window.prompt("Ton prénom (affiché à côté de tes commentaires) :", "");
      if (!name?.trim()) return;
      setClientName(name.trim());
      onClientNameChange?.(name.trim());
    }
    const anchorId = cryptoRandomId();
    // Wrap la sélection avec une span d'ancre directement dans le DOM, puis
    // déclenche le save de editorHtml pour persister le span.
    try {
      const span = document.createElement("span");
      span.className = ANCHOR_CLASS;
      span.dataset.commentId = anchorId;
      selectionBtn.range.surroundContents(span);
      const rect = span.getBoundingClientRect();
      saveEditorHtml();
      setSelectionBtn(null);
      setDraft({ kind: "new", anchorId, anchorText: selectionBtn.text, rect });
    } catch {
      // surroundContents échoue si la sélection traverse des bordures de
      // noeuds. Dans ce cas on fallback : on ne crée pas l'ancre.
      setSelectionBtn(null);
    }
  }, [selectionBtn, saveEditorHtml, author.type, needsClientNameSetup, clientName, onClientNameChange]);

  const submitNew = useCallback(
    async (body: string) => {
      if (draft.kind !== "new") return;
      const payload: Record<string, unknown> = {
        anchorId: draft.anchorId,
        anchorText: draft.anchorText,
        body,
      };
      if (author.type === "client") payload.authorName = clientName;
      const r = await fetch(commentsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        // Si la création serveur échoue, on retire l'ancre du DOM pour ne
        // pas laisser de fantôme.
        const el = editorRef.current;
        const span = el?.querySelector<HTMLSpanElement>(
          `span.${ANCHOR_CLASS}[data-comment-id="${cssEscape(draft.anchorId)}"]`,
        );
        if (span) unwrapSpan(span);
        saveEditorHtml();
        setDraft({ kind: "idle" });
        return;
      }
      const data = (await r.json()) as { comment: CommentDTO };
      setComments((prev) => [...prev, data.comment]);
      setDraft({ kind: "thread", anchorId: draft.anchorId, rect: draft.rect });
    },
    [draft, commentsEndpoint, author.type, clientName, editorRef, saveEditorHtml],
  );

  const submitReply = useCallback(
    async (anchorId: string, body: string, parentId: string) => {
      const thread = byAnchor.get(anchorId) ?? [];
      const anchorText = thread[0]?.anchorText ?? "";
      const payload: Record<string, unknown> = {
        anchorId,
        anchorText,
        body,
        parentId,
      };
      if (author.type === "client") payload.authorName = clientName;
      const r = await fetch(commentsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return;
      const data = (await r.json()) as { comment: CommentDTO };
      setComments((prev) => [...prev, data.comment]);
    },
    [byAnchor, commentsEndpoint, author.type, clientName],
  );

  const toggleResolved = useCallback(
    async (commentId: string, current: boolean) => {
      const url = `${commentsEndpoint}/${commentId}`;
      const payload: Record<string, unknown> = { resolved: !current };
      if (author.type === "client") payload.authorName = clientName;
      const r = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return;
      const data = (await r.json()) as { comment: CommentDTO };
      setComments((prev) => prev.map((c) => (c.id === commentId ? data.comment : c)));
    },
    [commentsEndpoint, author.type, clientName],
  );

  const deleteOne = useCallback(
    async (commentId: string) => {
      const url = `${commentsEndpoint}/${commentId}`;
      const init: RequestInit = { method: "DELETE" };
      if (author.type === "client") {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ authorName: clientName });
      }
      const r = await fetch(url, init);
      if (!r.ok) return;
      const deleted = comments.find((c) => c.id === commentId);
      setComments((prev) => {
        // Si on supprime un root, le serveur a supprimé tout le thread :
        // on retire localement tout ce qui partageait l'anchorId.
        if (deleted && !deleted.parentId) {
          return prev.filter((c) => c.anchorId !== deleted.anchorId);
        }
        return prev.filter((c) => c.id !== commentId);
      });
      // Si le thread a été supprimé entièrement, retire aussi l'ancre du DOM.
      if (deleted && !deleted.parentId) {
        const el = editorRef.current;
        const span = el?.querySelector<HTMLSpanElement>(
          `span.${ANCHOR_CLASS}[data-comment-id="${cssEscape(deleted.anchorId)}"]`,
        );
        if (span) {
          unwrapSpan(span);
          saveEditorHtml();
        }
        setDraft({ kind: "idle" });
      }
    },
    [commentsEndpoint, author.type, clientName, comments, editorRef, saveEditorHtml],
  );

  const closeDraft = () => setDraft({ kind: "idle" });

  // Render
  return (
    <>
      <CommentStyles />
      {selectionBtn && (
        <SelectionButton rect={selectionBtn.rect} onClick={startNewComment} />
      )}
      {draft.kind === "new" && (
        <NewCommentPopover
          rect={draft.rect}
          anchorText={draft.anchorText}
          onCancel={() => {
            const el = editorRef.current;
            const span = el?.querySelector<HTMLSpanElement>(
              `span.${ANCHOR_CLASS}[data-comment-id="${cssEscape(draft.anchorId)}"]`,
            );
            if (span) {
              unwrapSpan(span);
              saveEditorHtml();
            }
            closeDraft();
          }}
          onSubmit={submitNew}
        />
      )}
      {draft.kind === "thread" && (
        <ThreadPopover
          rect={draft.rect}
          thread={byAnchor.get(draft.anchorId) ?? []}
          author={author}
          authorClientName={clientName}
          onClose={closeDraft}
          onReply={(body, parentId) => submitReply(draft.anchorId, body, parentId)}
          onToggleResolved={toggleResolved}
          onDelete={deleteOne}
        />
      )}
      {loading && null}
    </>
  );
}

function SelectionButton({ rect, onClick }: { rect: DOMRect; onClick: () => void }) {
  if (typeof window === "undefined") return null;
  // Positionne juste en-dessous de la sélection, à droite.
  const top = rect.bottom + window.scrollY + 6;
  const left = rect.right + window.scrollX - 28;
  return createPortal(
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="df-comment-btn"
      style={{ position: "absolute", top, left, zIndex: 50 }}
      title="Commenter cette sélection"
    >
      <span aria-hidden>💬</span>
    </button>,
    document.body,
  );
}

function NewCommentPopover({
  rect,
  anchorText,
  onSubmit,
  onCancel,
}: {
  rect: DOMRect;
  anchorText: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  if (typeof window === "undefined") return null;
  const top = rect.bottom + window.scrollY + 8;
  const left = Math.max(8, rect.left + window.scrollX - 16);
  return createPortal(
    <div
      className="df-comment-popover"
      style={{ position: "absolute", top, left, zIndex: 51 }}
    >
      <blockquote className="df-comment-snippet">{truncate(anchorText, 160)}</blockquote>
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Ton commentaire…"
        rows={3}
        className="df-comment-textarea"
      />
      <div className="df-comment-actions">
        <button type="button" onClick={onCancel} className="df-comment-secondary">
          Annuler
        </button>
        <button
          type="button"
          onClick={() => body.trim() && onSubmit(body.trim())}
          disabled={!body.trim()}
          className="df-comment-primary"
        >
          Commenter
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ThreadPopover({
  rect,
  thread,
  author,
  authorClientName,
  onClose,
  onReply,
  onToggleResolved,
  onDelete,
}: {
  rect: DOMRect;
  thread: CommentDTO[];
  author: CommentAuthor;
  authorClientName: string;
  onClose: () => void;
  onReply: (body: string, parentId: string) => void;
  onToggleResolved: (commentId: string, current: boolean) => void;
  onDelete: (commentId: string) => void;
}) {
  const [reply, setReply] = useState("");
  const root = thread.find((c) => !c.parentId);
  const replies = thread.filter((c) => c.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!root) return null;
  if (typeof window === "undefined") return null;

  const top = rect.bottom + window.scrollY + 8;
  const left = Math.max(8, rect.left + window.scrollX - 16);
  const resolved = !!root.resolvedAt;

  const canEdit = (c: CommentDTO) =>
    (author.type === "user" && c.authorType === "user") ||
    (author.type === "client" && c.authorType === "client" && c.authorName === authorClientName);

  return createPortal(
    <div
      className="df-comment-popover df-comment-thread"
      style={{ position: "absolute", top, left, zIndex: 51 }}
    >
      <header className="df-comment-thread-header">
        <span className="df-comment-thread-title">
          {resolved ? "Résolu" : `${thread.length} commentaire${thread.length > 1 ? "s" : ""}`}
        </span>
        <button type="button" onClick={onClose} className="df-comment-close" aria-label="Fermer">
          ×
        </button>
      </header>
      <ul className="df-comment-list">
        {[root, ...replies].map((c) => (
          <li key={c.id} className="df-comment-item">
            <div className="df-comment-meta">
              <strong>{c.authorName}</strong>
              <span className="df-comment-date">{formatDate(c.createdAt)}</span>
              {c.authorType === "client" && <span className="df-comment-tag">client</span>}
            </div>
            <div className="df-comment-body">{c.body}</div>
            {canEdit(c) && (
              <div className="df-comment-row-actions">
                <button
                  type="button"
                  className="df-comment-link"
                  onClick={() => {
                    if (window.confirm("Supprimer ce commentaire ?")) onDelete(c.id);
                  }}
                >
                  Supprimer
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!resolved && (
        <div className="df-comment-reply">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Répondre…"
            rows={2}
            className="df-comment-textarea"
          />
          <div className="df-comment-actions">
            <button
              type="button"
              onClick={() => onToggleResolved(root.id, resolved)}
              className="df-comment-secondary"
            >
              Résoudre
            </button>
            <button
              type="button"
              onClick={() => {
                if (reply.trim()) {
                  onReply(reply.trim(), root.id);
                  setReply("");
                }
              }}
              disabled={!reply.trim()}
              className="df-comment-primary"
            >
              Répondre
            </button>
          </div>
        </div>
      )}
      {resolved && (
        <div className="df-comment-actions">
          <button
            type="button"
            onClick={() => onToggleResolved(root.id, resolved)}
            className="df-comment-secondary"
          >
            Rouvrir
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

function CommentStyles() {
  return (
    <style>{`
      .${ANCHOR_CLASS} {
        background: rgba(255, 213, 79, 0.45);
        border-bottom: 1px dotted rgba(180, 130, 0, 0.7);
        cursor: pointer;
        padding: 0 1px;
        border-radius: 2px;
        transition: background-color 120ms;
      }
      .${ANCHOR_CLASS}:hover { background: rgba(255, 193, 7, 0.65); }
      .${ANCHOR_CLASS}.${ANCHOR_ACTIVE_CLASS} {
        background: rgba(255, 193, 7, 0.85);
        outline: 1px solid rgba(180, 130, 0, 0.55);
      }
      .${ANCHOR_CLASS}.${ANCHOR_RESOLVED_CLASS} {
        background: transparent;
        border-bottom: 1px dotted rgba(120, 120, 120, 0.5);
        color: inherit;
        opacity: 0.85;
      }
      .df-comment-btn {
        background: #fff;
        border: 1px solid #d4d4d8;
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 14px;
        line-height: 1;
        box-shadow: 0 4px 14px rgba(0,0,0,0.12);
        cursor: pointer;
      }
      .df-comment-btn:hover { background: #fef9c3; }
      .df-comment-popover {
        background: #fff;
        border: 1px solid #d4d4d8;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.14);
        padding: 12px;
        width: 320px;
        max-width: calc(100vw - 24px);
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #18181b;
      }
      .df-comment-thread { width: 360px; }
      .df-comment-thread-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid #f1f1f3;
      }
      .df-comment-thread-title { font-weight: 600; color: #3f3f46; font-size: 12px; }
      .df-comment-close {
        background: transparent; border: 0; cursor: pointer; font-size: 18px; line-height: 1;
        color: #71717a; padding: 0 4px;
      }
      .df-comment-snippet {
        margin: 0 0 8px 0;
        padding: 6px 10px;
        border-left: 3px solid #fcd34d;
        background: #fffbeb;
        font-style: italic;
        font-size: 12px;
        color: #52525b;
        border-radius: 0 4px 4px 0;
      }
      .df-comment-textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #d4d4d8;
        border-radius: 6px;
        padding: 6px 8px;
        font: inherit;
        font-size: 13px;
        resize: vertical;
        background: #fff;
        color: #18181b;
      }
      .df-comment-textarea:focus { outline: 2px solid #fcd34d; outline-offset: -1px; }
      .df-comment-actions {
        display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px;
      }
      .df-comment-primary, .df-comment-secondary {
        font: inherit; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
      }
      .df-comment-primary {
        background: #f59e0b; color: #fff; border: 1px solid #d97706;
      }
      .df-comment-primary:hover { background: #d97706; }
      .df-comment-primary:disabled { background: #d4d4d8; border-color: #d4d4d8; cursor: not-allowed; }
      .df-comment-secondary { background: #f4f4f5; color: #18181b; border: 1px solid #d4d4d8; }
      .df-comment-secondary:hover { background: #e4e4e7; }
      .df-comment-list { list-style: none; padding: 0; margin: 0 0 8px 0; max-height: 280px; overflow-y: auto; }
      .df-comment-item { padding: 6px 0; border-top: 1px solid #f4f4f5; }
      .df-comment-item:first-child { border-top: 0; padding-top: 0; }
      .df-comment-meta { display: flex; gap: 6px; align-items: baseline; }
      .df-comment-meta strong { font-weight: 600; font-size: 12px; }
      .df-comment-date { font-size: 11px; color: #71717a; }
      .df-comment-tag {
        font-size: 10px; padding: 1px 5px; border-radius: 999px;
        background: #fef3c7; color: #92400e; text-transform: uppercase; letter-spacing: 0.04em;
      }
      .df-comment-body { white-space: pre-wrap; word-break: break-word; margin: 2px 0 4px 0; font-size: 13px; }
      .df-comment-row-actions { display: flex; gap: 6px; font-size: 11px; }
      .df-comment-link {
        background: transparent; border: 0; padding: 0; cursor: pointer; color: #b91c1c; font-size: 11px;
      }
      .df-comment-link:hover { text-decoration: underline; }
      .df-comment-reply { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f4f4f5; }
    `}</style>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "c-" + Math.random().toString(36).slice(2);
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/"/g, '\\"');
}

function rangeIntersectsAnchor(range: Range, root: HTMLElement): boolean {
  const fragment = range.cloneContents();
  if (fragment.querySelector(`span.${ANCHOR_CLASS}`)) return true;
  let node: Node | null = range.commonAncestorContainer;
  while (node && node !== root) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).classList?.contains(ANCHOR_CLASS)
    ) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

function unwrapSpan(span: HTMLSpanElement) {
  const parent = span.parentNode;
  if (!parent) return;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
}
