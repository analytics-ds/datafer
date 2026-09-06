"use client";

import { useState, useTransition } from "react";
import { updateFolderAction } from "./actions";
import { PencilIcon } from "@/components/icons";

export function EditFolderButton({
  folderId,
  folderName,
  folderWebsite,
}: {
  folderId: string;
  folderName: string;
  folderWebsite: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(folderName);
  const [website, setWebsite] = useState(folderWebsite ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpen() {
    setName(folderName);
    setWebsite(folderWebsite ?? "");
    setError(null);
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateFolderAction(folderId, {
        name,
        website: website.trim() || null,
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  const unchanged = name.trim() === folderName && website.trim() === (folderWebsite ?? "");

  return (
    <>
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-2 px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold border bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg-warm)] transition-colors"
      >
        <PencilIcon size={14} />
        Renommer
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
            <div className="flex items-center gap-2 mb-5">
              <PencilIcon size={14} />
              <span className="font-semibold text-[16px]">Modifier le client</span>
            </div>

            <label className="block text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[6px]">
              Nom du client
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              maxLength={120}
              className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
            />

            <label className="block text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[6px]">
              Site web{" "}
              <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">
                (favicon auto)
              </span>
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://www.exemple.com"
              className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-2 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
            />
            <p className="text-[11px] text-[var(--text-muted)] mb-6">
              Le site sert aussi de confirmation à la suppression du client.
            </p>

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
                disabled={pending || !name.trim() || unchanged}
                className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--bg-black)] text-[var(--text-inverse)] hover:bg-[var(--bg-dark)] disabled:opacity-40 transition-colors"
              >
                {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
