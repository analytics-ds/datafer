"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { faviconUrl } from "@/lib/favicon";
import { deleteFolderAction, toggleFavoriteAction } from "./actions";
import { StarIcon, StarFillIcon, TrashIcon } from "@/components/icons";
import { useI18n, useT } from "@/lib/i18n/context";
import { formatNumber } from "@/lib/relative-date";

type Folder = {
  id: string;
  name: string;
  website: string | null;
  briefCount: number;
  totalVolume: number | null;
  positionedCount: number;
  bestPosition: number | null;
  isFavorite: number;
};

export function FolderListCard({ folder }: { folder: Folder }) {
  const { locale, t } = useI18n();
  const [hover, setHover] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [favorited, setFavorited] = useState(folder.isFavorite === 1);
  const [pendingFav, startFavTransition] = useTransition();
  const favicon = faviconUrl(folder.website, 56);

  function onToggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !favorited;
    setFavorited(next);
    startFavTransition(async () => {
      const res = await toggleFavoriteAction(folder.id);
      if (!res.ok) setFavorited(!next);
      else setFavorited(res.favorited);
    });
  }

  return (
    <>
      <div
        className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-6 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)] hover:-translate-y-[2px] transition-all duration-200"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Link
          href={`/app/folders/${folder.id}`}
          className="absolute inset-0 rounded-[var(--radius)]"
          aria-label={folder.name}
        />

        <div className="relative pointer-events-none">
          <div className="flex items-center gap-3 mb-2">
            {favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={favicon}
                alt=""
                width={28}
                height={28}
                className="rounded-[var(--radius-xs)] bg-[var(--bg-warm)] shrink-0"
                loading="lazy"
              />
            ) : (
              <span className="w-7 h-7 rounded-[var(--radius-xs)] bg-[var(--bg-warm)] text-[var(--text-muted)] flex items-center justify-center text-[11px] shrink-0">·</span>
            )}
            <span className="font-semibold text-[14px] truncate">{folder.name}</span>
          </div>
          {folder.website && (
            <div className="text-[11px] text-[var(--text-muted)] font-mono truncate mb-3">
              {folder.website}
            </div>
          )}
          <div className="text-[11px] text-[var(--text-secondary)] font-mono">
            {t(folder.briefCount > 1 ? "folderCard.briefs.plural" : "folderCard.briefs", { count: folder.briefCount })}
          </div>
          {folder.briefCount > 0 && folder.totalVolume != null && (
            <div className="flex flex-wrap gap-[5px] mt-[10px] pointer-events-auto">
              <span
                title={t("folderCard.volume.tooltip")}
                className="inline-flex items-center gap-[5px] px-[8px] py-[2px] rounded-full text-[11px] font-medium border bg-[var(--bg-warm)] text-[var(--text-secondary)]"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="text-[9px] uppercase tracking-[0.2px] opacity-75">{t("brief.pill.volume")}</span>
                <span className="font-mono font-semibold">
                  {formatNumber(folder.totalVolume, locale)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
          <button
            onClick={onToggleFavorite}
            disabled={pendingFav}
            aria-label={favorited ? t("favorite.remove") : t("favorite.add")}
            title={favorited ? t("favorite.remove") : t("favorite.add")}
            className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] border transition-all ${
              favorited
                ? "bg-[var(--bg-olive-light)] border-[var(--accent)] text-[var(--text)] opacity-100"
                : `bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--bg-olive-light)] ${
                    hover ? "opacity-100" : "opacity-0"
                  }`
            } disabled:opacity-50`}
          >
            {favorited ? <StarFillIcon size={14} /> : <StarIcon size={14} />}
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setModalOpen(true);
            }}
            aria-label={t("folderDelete.title")}
            title={t("folderDelete.title")}
            className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--red)] hover:border-[var(--red)]/40 hover:bg-[var(--red-bg)] transition-all ${
              hover ? "opacity-100" : "opacity-0"
            }`}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      {modalOpen && (
        <DeleteConfirmModal
          folderId={folder.id}
          folderName={folder.name}
          folderWebsite={folder.website}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function DeleteConfirmModal({
  folderId,
  folderName,
  folderWebsite,
  onClose,
}: {
  folderId: string;
  folderName: string;
  folderWebsite: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const expected = (folderWebsite ?? folderName).trim();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await deleteFolderAction(folderId, confirmation);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => !pending && onClose()}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-7 w-[500px] max-w-full shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-2 mb-3 text-[var(--red)]">
          <TrashIcon size={14} />
          <span className="font-semibold text-[16px]">{t("folderDelete.title.named", { name: folderName })}</span>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] mb-5">
          {t("folderDelete.warning")}
        </p>
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-xs)] px-3 py-2 mb-3 font-mono text-[12px] text-[var(--text)] select-all">
          {expected}
        </div>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={t("folderDelete.placeholder")}
          className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-4 outline-none focus:border-[var(--red)] transition-colors text-[14px] bg-[var(--bg-card)] font-mono"
          autoFocus
        />

        {error && (
          <div className="text-[12px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/20 rounded-[var(--radius-xs)] px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] disabled:opacity-50 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending || confirmation.trim() !== expected}
            className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {pending ? t("card.delete.pending") : t("folderDelete.confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
