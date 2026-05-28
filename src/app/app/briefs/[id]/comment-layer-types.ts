export type CommentDTO = {
  id: string;
  briefId: string;
  anchorId: string;
  anchorText: string;
  parentId: string | null;
  authorType: "user" | "client";
  authorId: string | null;
  authorName: string;
  /** Image avatar : user.image côté user, favicon du folder côté client. */
  authorImage: string | null;
  body: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommentAuthor =
  | { type: "user"; name: string }
  | { type: "client"; name: string };
