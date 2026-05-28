"use client";

import { useCallback, useEffect, useState } from "react";
import type { CommentAuthor, CommentDTO } from "./comment-layer-types";

/**
 * Hook unique qui possède la liste des commentaires d'un brief et expose les
 * actions CRUD. Partagé entre `CommentLayer` (l'éditeur) et `CommentsTab`
 * (l'onglet Commentaires) pour qu'ils restent synchronisés.
 */
export function useBriefComments(commentsEndpoint: string, author: CommentAuthor) {
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loading, setLoading] = useState(true);

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

  const create = useCallback(
    async (input: {
      anchorId: string;
      anchorText: string;
      body: string;
      parentId?: string | null;
    }): Promise<CommentDTO | null> => {
      const payload: Record<string, unknown> = {
        anchorId: input.anchorId,
        anchorText: input.anchorText,
        body: input.body,
      };
      if (input.parentId) payload.parentId = input.parentId;
      if (author.type === "client") payload.authorName = author.name;
      const r = await fetch(commentsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return null;
      const data = (await r.json()) as { comment: CommentDTO };
      setComments((prev) => [...prev, data.comment]);
      return data.comment;
    },
    [commentsEndpoint, author],
  );

  const patch = useCallback(
    async (
      commentId: string,
      changes: { body?: string; resolved?: boolean },
    ): Promise<CommentDTO | null> => {
      const payload: Record<string, unknown> = { ...changes };
      if (author.type === "client") payload.authorName = author.name;
      const r = await fetch(`${commentsEndpoint}/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return null;
      const data = (await r.json()) as { comment: CommentDTO };
      setComments((prev) => prev.map((c) => (c.id === commentId ? data.comment : c)));
      return data.comment;
    },
    [commentsEndpoint, author],
  );

  const remove = useCallback(
    async (commentId: string): Promise<{ ok: boolean; threadDeleted: boolean; anchorId?: string }> => {
      const target = comments.find((c) => c.id === commentId);
      const init: RequestInit = { method: "DELETE" };
      if (author.type === "client") {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ authorName: author.name });
      }
      const r = await fetch(`${commentsEndpoint}/${commentId}`, init);
      if (!r.ok) return { ok: false, threadDeleted: false };
      const threadDeleted = !!target && !target.parentId;
      setComments((prev) => {
        if (target && !target.parentId) {
          return prev.filter((c) => c.anchorId !== target.anchorId);
        }
        return prev.filter((c) => c.id !== commentId);
      });
      return { ok: true, threadDeleted, anchorId: target?.anchorId };
    },
    [commentsEndpoint, author, comments],
  );

  return { comments, loading, refresh, create, patch, remove };
}
