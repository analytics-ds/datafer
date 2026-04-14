"use client";

import { useEffect, useRef, useState } from "react";
import { faviconUrl } from "@/lib/favicon";

export type FolderOption = {
  id: string;
  name: string;
  website: string | null;
  scope: "personal" | "agency";
};

export function FolderSelect({
  folders,
  value,
  onChange,
  name,
}: {
  folders: FolderOption[];
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = folders.find((f) => f.id === value) ?? null;
  const personal = folders.filter((f) => f.scope === "personal");
  const agency = folders.filter((f) => f.scope === "agency");

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] outline-none text-[14px] bg-[var(--bg-card)] text-left flex items-center justify-between gap-3 hover:border-[var(--border-strong)] focus:border-[var(--bg-black)] transition-colors"
      >
        <span className="flex items-center gap-[10px] min-w-0">
          {selected ? (
            <>
              <FolderFavicon website={selected.website} size={18} />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">— Aucun dossier —</span>
          )}
        </span>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="shrink-0 text-[var(--text-muted)]">
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] max-h-[320px] overflow-y-auto py-1">
          <Option
            label="— Aucun dossier —"
            selected={!value}
            muted
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          />
          {personal.length > 0 && (
            <>
              <GroupHeader>Mes dossiers</GroupHeader>
              {personal.map((f) => (
                <Option
                  key={f.id}
                  label={f.name}
                  website={f.website}
                  selected={value === f.id}
                  onClick={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}
          {agency.length > 0 && (
            <>
              <GroupHeader>Dossiers datashake</GroupHeader>
              {agency.map((f) => (
                <Option
                  key={f.id}
                  label={f.name}
                  website={f.website}
                  selected={value === f.id}
                  onClick={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  website,
  selected,
  muted,
  onClick,
}: {
  label: string;
  website?: string | null;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-[10px] px-3 py-[7px] text-[13px] text-left hover:bg-[var(--bg-warm)] transition-colors ${
        selected ? "bg-[var(--bg-warm)] font-semibold" : ""
      } ${muted ? "text-[var(--text-muted)]" : ""}`}
    >
      {website !== undefined && <FolderFavicon website={website ?? null} size={16} />}
      <span className="truncate flex-1">{label}</span>
      {selected && <span className="text-[var(--accent-dark)] text-[12px]">✓</span>}
    </button>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
      {children}
    </div>
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
