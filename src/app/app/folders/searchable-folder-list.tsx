"use client";

import { useMemo, useState } from "react";
import { FolderListCard } from "./folder-list-card";

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

export function SearchableFolderList({ folders }: { folders: Folder[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return folders;
    return folders.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.website?.toLowerCase().includes(q) ?? false),
    );
  }, [folders, q]);

  return (
    <>
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un client (nom ou site)…"
          className="w-full pl-9 pr-9 py-[9px] text-[13px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            ×
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[var(--text-muted)]">
          Aucun client ne correspond à « {query} ».
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <FolderListCard key={f.id} folder={f} />
          ))}
        </div>
      )}
    </>
  );
}
