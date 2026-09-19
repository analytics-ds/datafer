"use client";

import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "./actions";
import { StarIcon, StarFillIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/context";

export function FavoriteButton({
  folderId,
  initialFavorited,
}: {
  folderId: string;
  initialFavorited: boolean;
}) {
  const t = useT();
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
      title={favorited ? t("favorite.remove") : t("favorite.add")}
      className={`inline-flex items-center gap-2 px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold border transition-colors ${
        favorited
          ? "bg-[var(--bg-olive-light)] border-[var(--accent)] text-[var(--text)]"
          : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text)]"
      } disabled:opacity-50`}
    >
      {favorited ? <StarFillIcon size={14} /> : <StarIcon size={14} />}
      {favorited ? t("favorite.on") : t("favorite.add")}
    </button>
  );
}
