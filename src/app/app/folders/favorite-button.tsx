"use client";

import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "./actions";

export function FavoriteButton({
  folderId,
  initialFavorited,
}: {
  folderId: string;
  initialFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    const next = !favorited;
    setFavorited(next);
    startTransition(async () => {
      const res = await toggleFavoriteAction(folderId);
      if (!res.ok) setFavorited(!next);
      else setFavorited(res.favorited);
    });
  };

  return (
    <button
      onClick={onClick}
      disabled={pending}
      title={favorited ? "Retirer des favoris" : "Ajouter aux favoris"}
      className={`inline-flex items-center gap-2 px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold border transition-colors ${
        favorited
          ? "bg-[var(--bg-olive-light)] border-[var(--accent)] text-[var(--accent-dark)]"
          : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text)]"
      } disabled:opacity-50`}
    >
      <StarIcon filled={favorited} />
      {favorited ? "Favori" : "Ajouter aux favoris"}
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"}>
      <path
        d="M10 2l2.4 5.2 5.6.6-4.2 3.9 1.2 5.7L10 14.5l-5 2.9 1.2-5.7L2 7.8l5.6-.6L10 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
