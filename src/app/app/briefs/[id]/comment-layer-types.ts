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
