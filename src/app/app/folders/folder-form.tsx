"use client";

import { createFolderAction } from "./actions";

export function FolderForm({ scope }: { scope: "personal" | "agency" }) {
  return (
    <form
      action={createFolderAction}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] max-w-[560px]"
    >
      <input type="hidden" name="scope" value={scope} />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Nom du client
      </label>
      <input
        type="text"
        name="name"
        required
        autoFocus
        placeholder="Ex. Rip Curl, PBN running, Clients e-com…"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Site web <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">(favicon auto)</span>
      </label>
      <input
        type="url"
        name="website"
        placeholder="https://www.exemple.com"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-2 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
      />
      <p className="text-[11px] text-[var(--text-muted)] mb-7">
        Le favicon du site est récupéré automatiquement pour illustrer le client.
      </p>

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-6 py-[11px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
      >
        Créer le client
      </button>
    </form>
  );
}
