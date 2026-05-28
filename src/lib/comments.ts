import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { brief, briefComment, client, user as userTable } from "@/db/schema";
import { faviconUrl } from "@/lib/favicon";

export type CommentDTO = {
  id: string;
  briefId: string;
  anchorId: string;
  anchorText: string;
  parentId: string | null;
  authorType: "user" | "client";
  authorId: string | null;
  authorName: string;
  /**
   * URL d'avatar à afficher à côté du nom :
   * - pour les commentaires `user`, `user.image` rejoint sur authorId
   *   (typiquement /avatars/<prénom>.jpeg)
   * - pour les commentaires `client`, favicon du site du dossier rattaché au
   *   brief (résolu via faviconUrl(client.website))
   * Null si on n'a rien à afficher (fallback initiales côté UI).
   */
  authorImage: string | null;
  body: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowToDto(
  row: typeof briefComment.$inferSelect,
  authorImage: string | null,
): CommentDTO {
  return {
    id: row.id,
    briefId: row.briefId,
    anchorId: row.anchorId,
    anchorText: row.anchorText,
    parentId: row.parentId ?? null,
    authorType: row.authorType,
    authorId: row.authorId ?? null,
    authorName: row.authorName,
    authorImage,
    body: row.body,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedByName: row.resolvedByName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCommentsForBrief(briefId: string, db?: Db): Promise<CommentDTO[]> {
  const orm = db ?? getDb();
  // On résout l'avatar du dossier client une fois (favicon du site rattaché)
  // pour tous les commentaires client, et l'image user via join sur authorId
  // pour chaque commentaire user.
  const [b] = await orm
    .select({ clientId: brief.clientId })
    .from(brief)
    .where(eq(brief.id, briefId))
    .limit(1);
  let clientImage: string | null = null;
  if (b?.clientId) {
    const [c] = await orm
      .select({ website: client.website })
      .from(client)
      .where(eq(client.id, b.clientId))
      .limit(1);
    clientImage = faviconUrl(c?.website ?? null, 64);
  }
  const rows = await orm
    .select({
      comment: briefComment,
      userImage: userTable.image,
    })
    .from(briefComment)
    .leftJoin(userTable, eq(userTable.id, briefComment.authorId))
    .where(eq(briefComment.briefId, briefId))
    .orderBy(asc(briefComment.createdAt));
  return rows.map((r) =>
    rowToDto(r.comment, r.comment.authorType === "user" ? r.userImage ?? null : clientImage),
  );
}

export type CreateCommentInput = {
  briefId: string;
  anchorId: string;
  anchorText: string;
  body: string;
  parentId?: string | null;
  author:
    | { type: "user"; id: string; name: string }
    | { type: "client"; name: string };
};

export type CreateCommentResult =
  | { ok: true; comment: CommentDTO }
  | { ok: false; status: number; error: string };

export async function createComment(
  input: CreateCommentInput,
  db?: Db,
): Promise<CreateCommentResult> {
  const orm = db ?? getDb();

  const body = input.body.trim();
  const anchorText = input.anchorText.trim();
  const authorName = input.author.name.trim();
  if (!body) return { ok: false, status: 400, error: "body required" };
  if (!anchorText) return { ok: false, status: 400, error: "anchorText required" };
  if (!authorName) return { ok: false, status: 400, error: "authorName required" };
  if (!input.anchorId) return { ok: false, status: 400, error: "anchorId required" };

  // Vérifie que le brief existe avant d'insérer (sinon FK error peu lisible).
  const [b] = await orm.select({ id: brief.id }).from(brief).where(eq(brief.id, input.briefId)).limit(1);
  if (!b) return { ok: false, status: 404, error: "brief not found" };

  // Si parentId fourni, vérifier qu'il appartient au même brief et au même
  // anchorId (sinon on aurait un thread incohérent).
  if (input.parentId) {
    const [parent] = await orm
      .select({ id: briefComment.id, briefId: briefComment.briefId, anchorId: briefComment.anchorId })
      .from(briefComment)
      .where(eq(briefComment.id, input.parentId))
      .limit(1);
    if (!parent || parent.briefId !== input.briefId || parent.anchorId !== input.anchorId) {
      return { ok: false, status: 400, error: "parent comment not found in this thread" };
    }
  }

  const id = randomUUID();
  await orm.insert(briefComment).values({
    id,
    briefId: input.briefId,
    anchorId: input.anchorId,
    anchorText: anchorText.slice(0, 500),
    parentId: input.parentId ?? null,
    authorType: input.author.type,
    authorId: input.author.type === "user" ? input.author.id : null,
    authorName: authorName.slice(0, 80),
    body: body.slice(0, 4000),
  });

  const [row] = await orm.select().from(briefComment).where(eq(briefComment.id, id)).limit(1);
  return { ok: true, comment: rowToDto(row, await resolveAuthorImage(orm, row)) };
}

export type UpdateCommentInput = {
  commentId: string;
  briefId: string;
  body?: string;
  /** true = mark resolved, false = unresolve. Si undefined, ne touche pas au flag. */
  resolved?: boolean;
  /** Nom de la personne qui résout. Requis si resolved=true. */
  resolverName?: string;
  /**
   * Garde : seul l'auteur peut éditer le `body` de son commentaire.
   * Le check est fait au niveau route (avec l'identité connue), mais on accepte
   * un callback ici pour rester explicite. Null = pas de check (admin/cron).
   */
  requireAuthor?: { type: "user"; id: string } | { type: "client"; name: string } | null;
};

export type UpdateCommentResult =
  | { ok: true; comment: CommentDTO }
  | { ok: false; status: number; error: string };

export async function updateComment(
  input: UpdateCommentInput,
  db?: Db,
): Promise<UpdateCommentResult> {
  const orm = db ?? getDb();

  const [row] = await orm
    .select()
    .from(briefComment)
    .where(and(eq(briefComment.id, input.commentId), eq(briefComment.briefId, input.briefId)))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "comment not found" };

  // Garde d'autorité sur l'édition du body : seul l'auteur peut éditer son
  // propre commentaire (la résolution, elle, est ouverte à tous).
  if (input.body !== undefined && input.requireAuthor) {
    const a = input.requireAuthor;
    if (a.type === "user" && (row.authorType !== "user" || row.authorId !== a.id)) {
      return { ok: false, status: 403, error: "only the author can edit" };
    }
    if (a.type === "client" && (row.authorType !== "client" || row.authorName !== a.name)) {
      return { ok: false, status: 403, error: "only the author can edit" };
    }
  }

  const patch: Partial<typeof briefComment.$inferInsert> = { updatedAt: new Date() };
  if (input.body !== undefined) {
    const trimmed = input.body.trim();
    if (!trimmed) return { ok: false, status: 400, error: "body cannot be empty" };
    patch.body = trimmed.slice(0, 4000);
  }
  if (input.resolved === true) {
    const name = (input.resolverName ?? "").trim();
    if (!name) return { ok: false, status: 400, error: "resolverName required" };
    patch.resolvedAt = new Date();
    patch.resolvedByName = name.slice(0, 80);
  } else if (input.resolved === false) {
    patch.resolvedAt = null;
    patch.resolvedByName = null;
  }

  await orm.update(briefComment).set(patch).where(eq(briefComment.id, input.commentId));
  const [updated] = await orm.select().from(briefComment).where(eq(briefComment.id, input.commentId)).limit(1);
  return { ok: true, comment: rowToDto(updated, await resolveAuthorImage(orm, updated)) };
}

/**
 * Helper utilisé après create/update pour reconstruire l'image avatar :
 * - user → user.image rejoint par authorId
 * - client → favicon du folder rattaché au brief
 */
async function resolveAuthorImage(
  orm: Db,
  row: typeof briefComment.$inferSelect,
): Promise<string | null> {
  if (row.authorType === "user" && row.authorId) {
    const [u] = await orm
      .select({ image: userTable.image })
      .from(userTable)
      .where(eq(userTable.id, row.authorId))
      .limit(1);
    return u?.image ?? null;
  }
  if (row.authorType === "client") {
    const [b] = await orm
      .select({ clientId: brief.clientId })
      .from(brief)
      .where(eq(brief.id, row.briefId))
      .limit(1);
    if (!b?.clientId) return null;
    const [c] = await orm
      .select({ website: client.website })
      .from(client)
      .where(eq(client.id, b.clientId))
      .limit(1);
    return faviconUrl(c?.website ?? null, 64);
  }
  return null;
}

export type DeleteCommentInput = {
  commentId: string;
  briefId: string;
  requireAuthor?: { type: "user"; id: string } | { type: "client"; name: string } | null;
};

export type DeleteCommentResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function deleteComment(
  input: DeleteCommentInput,
  db?: Db,
): Promise<DeleteCommentResult> {
  const orm = db ?? getDb();
  const [row] = await orm
    .select({
      id: briefComment.id,
      anchorId: briefComment.anchorId,
      parentId: briefComment.parentId,
      authorType: briefComment.authorType,
      authorId: briefComment.authorId,
      authorName: briefComment.authorName,
    })
    .from(briefComment)
    .where(and(eq(briefComment.id, input.commentId), eq(briefComment.briefId, input.briefId)))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "comment not found" };

  if (input.requireAuthor) {
    const a = input.requireAuthor;
    if (a.type === "user" && (row.authorType !== "user" || row.authorId !== a.id)) {
      return { ok: false, status: 403, error: "only the author can delete" };
    }
    if (a.type === "client" && (row.authorType !== "client" || row.authorName !== a.name)) {
      return { ok: false, status: 403, error: "only the author can delete" };
    }
  }

  // Si on supprime un root, on supprime tout le thread (cascade applicative
  // car SQLite n'a pas de self-cascade simple ici).
  if (!row.parentId) {
    await orm
      .delete(briefComment)
      .where(and(eq(briefComment.briefId, input.briefId), eq(briefComment.anchorId, row.anchorId)));
  } else {
    await orm.delete(briefComment).where(eq(briefComment.id, input.commentId));
  }
  return { ok: true };
}

/** Renvoie briefId si le token correspond, sinon null. */
export async function resolveBriefByShareToken(token: string, db?: Db): Promise<string | null> {
  const orm = db ?? getDb();
  const [row] = await orm
    .select({ id: brief.id })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);
  return row?.id ?? null;
}
