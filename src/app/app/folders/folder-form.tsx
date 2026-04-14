"use client";

import { createFolderAction } from "./actions";

const COLORS = [
  "#C2B642",
  "#2D8C5A",
  "#4A90D9",
  "#7B61FF",
  "#D4890E",
  "#C94040",
  "#1A1A1A",
];

export function FolderForm({ scope }: { scope: "personal" | "agency" }) {
  return (
    <form
      action={createFolderAction}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] max-w-[560px]"
    >
      <input type="hidden" name="scope" value={scope} />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Nom du dossier
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
        Site web <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">(optionnel)</span>
      </label>
      <input
        type="url"
        name="website"
        placeholder="https://www.exemple.com"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Couleur
      </label>
      <div className="flex items-center gap-2 mb-8">
        {COLORS.map((c, i) => (
          <label key={c} className="cursor-pointer">
            <input
              type="radio"
              name="color"
              value={c}
              defaultChecked={i === 0}
              className="sr-only peer"
            />
            <span
              className="block w-7 h-7 rounded-full border-2 border-transparent peer-checked:border-[var(--bg-black)] transition-colors"
              style={{ background: c }}
            />
          </label>
        ))}
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-6 py-[11px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
      >
        Créer le dossier
      </button>
    </form>
  );
}
