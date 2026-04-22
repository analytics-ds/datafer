"use client";

import { useMemo, useState } from "react";
import { BriefCard, type BriefCardData, type FolderOption } from "./brief-card";

export function SearchableBriefList({
  briefs,
  folders,
}: {
  briefs: BriefCardData[];
  folders: FolderOption[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return briefs;
    return briefs.filter((b) => {
      if (b.keyword.toLowerCase().includes(q)) return true;
      if (b.folder?.name?.toLowerCase().includes(q)) return true;
      if (b.folder?.website?.toLowerCase().includes(q)) return true;
      if (b.author?.name?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [briefs, q]);

  return (
    <>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Rechercher par mot-clé, client, auteur…"
      />
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[var(--text-muted)]">
          Aucun brief ne correspond à « {query} ».
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((b) => (
            <BriefCard key={b.id} brief={b} folders={folders} />
          ))}
        </div>
      )}
    </>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-4">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-[9px] text-[13px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ×
        </button>
      )}
    </div>
  );
}
