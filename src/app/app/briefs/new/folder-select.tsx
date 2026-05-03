"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { faviconUrl } from "@/lib/favicon";

export type FolderOption = {
  id: string;
  name: string;
  website: string | null;
};

export function FolderSelect({
  folders,
  value,
  onChange,
  name,
  emptyLabel = "Aucun client",
  emptyPlaceholder = "Aucun client (commence à taper pour rechercher)",
}: {
  folders: FolderOption[];
  value: string;
  onChange: (v: string) => void;
  name: string;
  /** Texte affiché pour la valeur vide (par défaut "Aucun client"). */
  emptyLabel?: string;
  /** Placeholder de l'input quand aucune valeur n'est sélectionnée. */
  emptyPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = folders.find((f) => f.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.website?.toLowerCase().includes(q) ?? false),
    );
  }, [folders, query]);

  const totalOptions = 1 + filtered.length; // 1 = "Aucun client"

  function commitIndex(i: number) {
    if (i === 0) {
      onChange("");
    } else {
      const f = filtered[i - 1];
      if (f) onChange(f.id);
    }
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(totalOptions - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) commitIndex(activeIdx);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  function onFocus() {
    setOpen(true);
    setActiveIdx(0);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} />

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {selected ? (
            <FolderFavicon website={selected.website} size={18} />
          ) : (
            <span className="w-[18px] h-[18px] rounded-[3px] bg-[var(--bg-warm)] block" />
          )}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selected?.name ?? ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          placeholder={emptyPlaceholder}
          className="w-full pl-[40px] pr-9 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] outline-none text-[14px] bg-[var(--bg-card)] hover:border-[var(--border-strong)] focus:border-[var(--bg-black)] transition-colors placeholder:text-[var(--text-muted)]"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"
          aria-label="Ouvrir la liste"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 8l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] max-h-[260px] overflow-y-auto py-1">
          <Option
            label={emptyLabel}
            selected={!value}
            active={activeIdx === 0}
            muted
            onMouseEnter={() => setActiveIdx(0)}
            onClick={() => commitIndex(0)}
          />
          {filtered.length === 0 && query && (
            <div className="px-3 py-[8px] text-[12px] text-[var(--text-muted)] italic">
              Aucun client ne correspond à « {query} ».
            </div>
          )}
          {filtered.map((f, i) => (
            <Option
              key={f.id}
              label={f.name}
              website={f.website}
              selected={value === f.id}
              active={activeIdx === i + 1}
              onMouseEnter={() => setActiveIdx(i + 1)}
              onClick={() => commitIndex(i + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  website,
  selected,
  active,
  muted,
  onMouseEnter,
  onClick,
}: {
  label: string;
  website?: string | null;
  selected: boolean;
  active: boolean;
  muted?: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full flex items-center gap-[10px] px-3 py-[7px] text-[13px] text-left transition-colors ${
        active ? "bg-[var(--bg-warm)]" : ""
      } ${selected ? "font-semibold" : ""} ${muted ? "text-[var(--text-muted)]" : ""}`}
    >
      {website !== undefined && <FolderFavicon website={website ?? null} size={16} />}
      <span className="truncate flex-1">{label}</span>
      {selected && <span className="text-[var(--accent-dark)] text-[12px]">✓</span>}
    </button>
  );
}

function FolderFavicon({ website, size }: { website: string | null; size: number }) {
  const src = faviconUrl(website, Math.max(size * 2, 32));
  if (!src) {
    return (
      <span
        className="rounded-[3px] bg-[var(--bg-warm)] text-[var(--text-muted)] flex items-center justify-center text-[10px] shrink-0"
        style={{ width: size, height: size }}
      >
        ·
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-[3px] bg-[var(--bg-warm)] shrink-0"
      loading="lazy"
    />
  );
}
