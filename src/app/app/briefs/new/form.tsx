"use client";

import { useState } from "react";

type Folder = { id: string; name: string; scope: "personal" | "agency" };

const COUNTRIES = [
  { value: "fr", label: "France" },
  { value: "es", label: "Espagne" },
  { value: "us", label: "États-Unis" },
  { value: "uk", label: "Royaume-Uni" },
  { value: "de", label: "Allemagne" },
  { value: "it", label: "Italie" },
];

export function NewBriefForm({ folders }: { folders: Folder[] }) {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("fr");
  const [folderId, setFolderId] = useState("");
  const [loading] = useState(false);

  const personal = folders.filter((f) => f.scope === "personal");
  const agency = folders.filter((f) => f.scope === "agency");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: POST /api/briefs → analyse SERP + NLP + Haloscan, puis redirect /app/briefs/[id]
    alert(
      `Création (placeholder) — keyword: "${keyword}" | pays: ${country} | dossier: ${folderId || "—"}`,
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)]"
    >
      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Mot-clé cible
      </label>
      <input
        type="text"
        required
        autoFocus
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="Ex. chaussures de running homme"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Marché
      </label>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {COUNTRIES.map((c) => (
          <button
            type="button"
            key={c.value}
            onClick={() => setCountry(c.value)}
            className={`px-3 py-[10px] rounded-[var(--radius-sm)] border-2 text-[13px] font-medium transition-colors ${
              country === c.value
                ? "border-[var(--bg-black)] bg-[var(--bg-black)] text-[var(--text-inverse)]"
                : "border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text)]"
            }`}
          >
            <span className="font-[family-name:var(--font-mono)] text-[11px] mr-2">
              {c.value.toUpperCase()}
            </span>
            {c.label}
          </button>
        ))}
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Dossier (optionnel)
      </label>
      <select
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-8 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
      >
        <option value="">— Aucun dossier —</option>
        {personal.length > 0 && (
          <optgroup label="Mes dossiers">
            {personal.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </optgroup>
        )}
        {agency.length > 0 && (
          <optgroup label="Dossiers datashake">
            {agency.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      <button
        type="submit"
        disabled={loading || !keyword.trim()}
        className="w-full bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] py-[13px] text-[14px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
      >
        {loading ? "Analyse en cours…" : "Lancer l'analyse →"}
      </button>

      <p className="text-[11px] text-[var(--text-muted)] mt-5 text-center">
        L&apos;analyse prend environ 15-30 secondes (SERP, crawl, NLP, Haloscan).
      </p>
    </form>
  );
}
