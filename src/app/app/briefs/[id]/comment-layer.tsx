"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CommentAuthor, CommentDTO } from "./comment-layer-types";

export type { CommentAuthor, CommentDTO };

/**
 * Couche de commentaires inline au-dessus du contentEditable de l'éditeur.
 * - écoute les sélections pour proposer un bouton « 💬 »
 * - injecte/lit les ancres `<span data-comment-id="…" contenteditable="false">`
 *   (le contenteditable=false empêche la frappe de propager le commentaire
 *   au paragraphe entier).
 * - affiche les threads en popover. Quand un thread est résolu, l'ancre est
 *   conservée mais son style devient totalement transparent et la popover
 *   ne s'ouvre plus au clic depuis l'éditeur (accès uniquement via l'onglet
 *   Commentaires).
 *
 * La state des comments est gérée par `useBriefComments` côté parent et passée
 * via les props ci-dessous, pour rester synchro avec l'onglet Commentaires.
 */

const ANCHOR_CLASS = "df-comment-anchor";
const ANCHOR_RESOLVED_CLASS = "df-comment-anchor-resolved";
const ANCHOR_ACTIVE_CLASS = "df-comment-anchor-active";

type Props = {
  editorRef: React.RefObject<HTMLDivElement | null>;
  saveEditorHtml: () => void;
  author: CommentAuthor;
  comments: CommentDTO[];
  create: (input: {
    anchorId: string;
    anchorText: string;
    body: string;
    parentId?: string | null;
  }) => Promise<CommentDTO | null>;
  patch: (
    commentId: string,
    changes: { body?: string; resolved?: boolean },
  ) => Promise<CommentDTO | null>;
  remove: (
    commentId: string,
  ) => Promise<{ ok: boolean; threadDeleted: boolean; anchorId?: string }>;
};

type DraftState =
  | { kind: "idle" }
  | { kind: "new"; anchorId: string; anchorText: string; rect: DOMRect }
  | { kind: "thread"; anchorId: string; rect: DOMRect };

export function CommentLayer({
  editorRef,
  saveEditorHtml,
  author,
  comments,
  create,
  patch,
  remove,
}: Props) {
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" });
  const [selectionBtn, setSelectionBtn] = useState<{
    rect: DOMRect;
    text: string;
    range: Range;
  } | null>(null);

  // Index par anchorId.
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

  // À chaque update des comments OU du editorHtml chargé, on resynchronise
  // les classes CSS des ancres (active / resolved) et on retire les ancres
  // orphelines (commentaire supprimé). On laisse les ancres éditables pour
  // permettre la modification du texte commenté ; la garde anti-propagation
  // est faite par le handler beforeinput plus bas.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const anchors = el.querySelectorAll<HTMLSpanElement>(`span.${ANCHOR_CLASS}[data-comment-id]`);
    anchors.forEach((span) => {
      if (span.contentEditable === "false") span.removeAttribute("contenteditable");
      const aid = span.dataset.commentId;
      if (!aid) return;
      const thread = byAnchor.get(aid);
      if (!thread || thread.length === 0) {
        // Anchor orpheline (commentaire supprimé) : on déballe.
        unwrapSpan(span);
        return;
      }
      const root = thread.find((c) => !c.parentId);
      const resolved = !!root?.resolvedAt;
      span.classList.toggle(ANCHOR_RESOLVED_CLASS, resolved);
    });
  }, [byAnchor, editorRef, comments]);

  // Empêche la frappe d'étendre un span d'ancre quand le curseur est
  // strictement au début ou à la fin de l'ancre. Au milieu, on laisse le
  // user modifier le texte commenté (cas typique : reformuler le passage).
  // Sur les bords, on annule l'insertion native via beforeinput puis on
  // insère manuellement les caractères dans le text node voisin (hors span),
  // et on émet un input event pour que le readEditor débouncé sauve l'état.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onBeforeInput = (e: Event) => {
      const ev = e as InputEvent;
      if (ev.inputType !== "insertText" || !ev.data) return;
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const span = findAncestorAnchor(range.startContainer, el);
      if (!span) return;
      const last = lastTextNodeInside(span);
      const first = firstTextNodeInside(span);
      const atEnd =
        !!last && range.startContainer === last && range.startOffset === last.textContent!.length;
      const atStart =
        !!first && range.startContainer === first && range.startOffset === 0;
      if (!atEnd && !atStart) return;
      ev.preventDefault();
      const data = ev.data;
      const parent = span.parentNode;
      if (!parent) return;
      let cursorNode: Text;
      let cursorOffset: number;
      if (atEnd) {
        const next = span.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
          (next as Text).insertData(0, data);
          cursorNode = next as Text;
          cursorOffset = data.length;
        } else {
          const newNode = document.createTextNode(data);
          parent.insertBefore(newNode, next);
          cursorNode = newNode;
          cursorOffset = data.length;
        }
      } else {
        const prev = span.previousSibling;
        if (prev && prev.nodeType === Node.TEXT_NODE) {
          (prev as Text).appendData(data);
          cursorNode = prev as Text;
          cursorOffset = (prev as Text).length;
        } else {
          const newNode = document.createTextNode(data);
          parent.insertBefore(newNode, span);
          cursorNode = newNode;
          cursorOffset = data.length;
        }
      }
      const newRange = document.createRange();
      newRange.setStart(cursorNode, cursorOffset);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      // React onInput n'écoute pas les events dispatchés manuellement →
      // on appelle directement le hook qui rafraîchit l'état éditeur et
      // déclenche la sauvegarde débouncée.
      saveEditorHtml();
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, [editorRef, saveEditorHtml]);

  // Detection sélection.
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

  // Click sur ancre = ouvre thread (si pas résolu).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const span = target?.closest<HTMLSpanElement>(`span.${ANCHOR_CLASS}[data-comment-id]`);
      if (!span) return;
      // Ancre résolue = aucun comportement (le commentaire « disparaît »
      // côté éditeur ; il reste accessible via l'onglet Commentaires).
      if (span.classList.contains(ANCHOR_RESOLVED_CLASS)) return;
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

  // Toggle classe active pour highlight visuel pendant édition.
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
    const anchorId = cryptoRandomId();
    try {
      const span = document.createElement("span");
      span.className = ANCHOR_CLASS;
      span.dataset.commentId = anchorId;
      selectionBtn.range.surroundContents(span);
      const rect = span.getBoundingClientRect();
      // Replace la sélection juste après l'ancre, sinon le contentEditable
      // garde le focus à l'intérieur du span et la frappe suivante l'étend.
      // La popover ouvre dans la foulée donc le user tape dans la textarea ;
      // mais si la popover est fermée puis on tape, on ne grossit pas l'ancre.
      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.setStartAfter(span);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      saveEditorHtml();
      setSelectionBtn(null);
      setDraft({ kind: "new", anchorId, anchorText: selectionBtn.text, rect });
    } catch {
      // surroundContents échoue si la sélection traverse plusieurs balises.
      // On laisse simplement tomber le draft.
      setSelectionBtn(null);
    }
  }, [selectionBtn, saveEditorHtml]);

  const submitNew = useCallback(
    async (body: string) => {
      if (draft.kind !== "new") return;
      const c = await create({
        anchorId: draft.anchorId,
        anchorText: draft.anchorText,
        body,
      });
      if (!c) {
        // Si la création serveur échoue, retire l'ancre du DOM.
        const el = editorRef.current;
        const span = el?.querySelector<HTMLSpanElement>(
          `span.${ANCHOR_CLASS}[data-comment-id="${cssEscape(draft.anchorId)}"]`,
        );
        if (span) unwrapSpan(span);
        saveEditorHtml();
        setDraft({ kind: "idle" });
        return;
      }
      setDraft({ kind: "thread", anchorId: draft.anchorId, rect: draft.rect });
    },
    [draft, create, editorRef, saveEditorHtml],
  );

  const submitReply = useCallback(
    async (anchorId: string, body: string, parentId: string) => {
      const thread = byAnchor.get(anchorId) ?? [];
      const anchorText = thread[0]?.anchorText ?? "";
      await create({ anchorId, anchorText, body, parentId });
    },
    [byAnchor, create],
  );

  const toggleResolved = useCallback(
    async (commentId: string, current: boolean) => {
      const updated = await patch(commentId, { resolved: !current });
      if (!updated) return;
      // Si on vient de résoudre depuis le thread popover, on ferme la popover
      // (le surlignage disparaît et le clic n'ouvrira plus).
      if (!current) setDraft({ kind: "idle" });
    },
    [patch],
  );

  const deleteOne = useCallback(
    async (commentId: string) => {
      const res = await remove(commentId);
      if (!res.ok) return;
      if (res.threadDeleted && res.anchorId) {
        const el = editorRef.current;
        const span = el?.querySelector<HTMLSpanElement>(
          `span.${ANCHOR_CLASS}[data-comment-id="${cssEscape(res.anchorId)}"]`,
        );
        if (span) {
          unwrapSpan(span);
          saveEditorHtml();
        }
        setDraft({ kind: "idle" });
      }
    },
    [remove, editorRef, saveEditorHtml],
  );

  const closeDraft = () => setDraft({ kind: "idle" });

  return (
    <>
      <CommentStyles />
      {selectionBtn && <SelectionButton rect={selectionBtn.rect} onClick={startNewComment} />}
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
          onClose={closeDraft}
          onReply={(body, parentId) => submitReply(draft.anchorId, body, parentId)}
          onToggleResolved={toggleResolved}
          onDelete={deleteOne}
        />
      )}
    </>
  );
}

function SelectionButton({ rect, onClick }: { rect: DOMRect; onClick: () => void }) {
  if (typeof window === "undefined") return null;
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
  if (typeof window === "undefined") return null;
  const top = rect.bottom + window.scrollY + 8;
  const left = Math.max(8, rect.left + window.scrollX - 16);
  return createPortal(
    <div className="df-comment-popover" style={{ position: "absolute", top, left, zIndex: 51 }}>
      <blockquote className="df-comment-snippet">{truncate(anchorText, 160)}</blockquote>
      <textarea
        autoFocus
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
  onClose,
  onReply,
  onToggleResolved,
  onDelete,
}: {
  rect: DOMRect;
  thread: CommentDTO[];
  author: CommentAuthor;
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
    (author.type === "client" && c.authorType === "client" && c.authorName === author.name);

  return createPortal(
    <div className="df-comment-popover df-comment-thread" style={{ position: "absolute", top, left, zIndex: 51 }}>
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

export function CommentStyles() {
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
        border-bottom: 0;
        cursor: default;
        padding: 0;
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

function findAncestorAnchor(node: Node, root: HTMLElement): HTMLSpanElement | null {
  let cursor: Node | null = node;
  while (cursor && cursor !== root) {
    if (
      cursor.nodeType === Node.ELEMENT_NODE &&
      (cursor as HTMLElement).classList?.contains(ANCHOR_CLASS)
    ) {
      return cursor as HTMLSpanElement;
    }
    cursor = cursor.parentNode;
  }
  return null;
}

function firstTextNodeInside(el: Element): Text | null {
  let n: Node | null = el;
  while (n && n.firstChild) n = n.firstChild;
  return n && n.nodeType === Node.TEXT_NODE ? (n as Text) : null;
}

function lastTextNodeInside(el: Element): Text | null {
  let n: Node | null = el;
  while (n && n.lastChild) n = n.lastChild;
  return n && n.nodeType === Node.TEXT_NODE ? (n as Text) : null;
}

function unwrapSpan(span: HTMLSpanElement) {
  const parent = span.parentNode;
  if (!parent) return;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
}
