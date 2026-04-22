"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { faviconUrl } from "@/lib/favicon";
import { deleteFolderAction, toggleFavoriteAction } from "./actions";

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

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR");
}

export function FolderListCard({ folder }: { folder: Folder }) {
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
        className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] transition-all"
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
            <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate mb-3">
              {folder.website}
            </div>
          )}
          <div className="text-[11px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)]">
            {folder.briefCount} {folder.briefCount > 1 ? "briefs" : "brief"}
          </div>
          {folder.briefCount > 0 && folder.totalVolume != null && (
            <div className="flex flex-wrap gap-[5px] mt-[10px] pointer-events-auto">
              <span
                title="Volume de recherche cumulé sur tous les briefs du client"
                className="inline-flex items-center gap-[5px] px-[8px] py-[2px] rounded-full text-[11px] font-medium border cursor-help bg-[var(--bg-warm)] text-[var(--text-secondary)]"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="text-[9px] uppercase tracking-[0.5px] opacity-75">Vol</span>
                <span className="font-[family-name:var(--font-mono)] font-semibold">
                  {fmtNum(folder.totalVolume)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
          <button
            onClick={onToggleFavorite}
            disabled={pendingFav}
            aria-label={favorited ? "Retirer des favoris" : "Ajouter aux favoris"}
            title={favorited ? "Retirer des favoris" : "Ajouter aux favoris"}
            className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] border transition-all ${
              favorited
                ? "bg-[var(--bg-olive-light)] border-[var(--accent)] text-[var(--accent-dark)] opacity-100"
                : `bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent-dark)] hover:border-[var(--accent)] hover:bg-[var(--bg-olive-light)] ${
                    hover ? "opacity-100" : "opacity-0"
                  }`
            } disabled:opacity-50`}
          >
            <StarIcon filled={favorited} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setModalOpen(true);
            }}
            aria-label="Supprimer le client"
            title="Supprimer le client"
            className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--red)] hover:border-[var(--red)]/40 hover:bg-[var(--red-bg)] transition-all ${
              hover ? "opacity-100" : "opacity-0"
            }`}
          >
            <TrashIcon />
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
          <TrashIcon />
          <span className="font-semibold text-[16px]">Supprimer « {folderName} »</span>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] mb-5">
          Cette action est <strong>définitive</strong>. Tous les briefs rattachés à ce client
          seront également perdus. Pour confirmer, retape le site associé (ou le nom du
          client s&apos;il n&apos;a pas de site) :
        </p>
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-xs)] px-3 py-2 mb-3 font-[family-name:var(--font-mono)] text-[12px] text-[var(--text)] select-all">
          {expected}
        </div>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Retape le texte ci-dessus"
          className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-4 outline-none focus:border-[var(--red)] transition-colors text-[14px] bg-[var(--bg-card)] font-[family-name:var(--font-mono)]"
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
            Annuler
          </button>
          <button
            type="submit"
            disabled={pending || confirmation.trim() !== expected}
            className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {pending ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"}>
      <path
        d="M10 2l2.4 5.2 5.6.6-4.2 3.9 1.2 5.7L10 14.5l-5 2.9 1.2-5.7L2 7.8l5.6-.6L10 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 6h12M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2m1 0v10a1 1 0 01-1 1H7a1 1 0 01-1-1V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
