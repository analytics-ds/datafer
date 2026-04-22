"use client";

import { useState, useTransition } from "react";
import { deleteFolderAction } from "./actions";

export function DeleteFolderButton({
  folderId,
  folderName,
  folderWebsite,
}: {
  folderId: string;
  folderName: string;
  folderWebsite: string | null;
}) {
  const [open, setOpen] = useState(false);
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
    <>
      <button
        onClick={() => {
          setOpen(true);
          setConfirmation("");
          setError(null);
        }}
        className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold border bg-[var(--bg)] border-[var(--red)]/30 text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
      >
        <TrashIcon />
        Supprimer
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-7 w-[500px] max-w-full shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center gap-2 mb-3 text-[var(--red)]">
              <TrashIcon />
              <span className="font-semibold text-[16px]">Supprimer le client</span>
            </div>
            <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] mb-5">
              Cette action est <strong>définitive</strong>. Tous les briefs rattachés à ce client
              seront également perdus. Pour confirmer, retape le site associé (ou le nom
              du client s&apos;il n&apos;a pas de site) ci-dessous :
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
                onClick={() => setOpen(false)}
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
      )}
    </>
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
