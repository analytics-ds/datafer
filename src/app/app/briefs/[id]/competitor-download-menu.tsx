"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mini-menu pour télécharger le contenu d'un concurrent en HTML / Word / PDF.
 * Pas de prop hasContent : on tente le download et le serveur renvoie 404
 * avec un message clair pour les briefs antérieurs au 2026-05-02 (avant la
 * persistance text/structuredHtml).
 */
export function CompetitorDownloadMenu({
  briefId,
  position,
  variant = "compact",
  disabled = false,
}: {
  briefId: string;
  position: number;
  /** "compact" = petite icône ↓ pour sidebar. "button" = bouton large pour la liste SERP. */
  variant?: "compact" | "button";
  /** Désactive le menu (ex: concurrent sans contenu persisté). */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const base = `/api/v2/briefs/${briefId}/competitors/${position}`;

  function download(format: "html" | "docx") {
    const a = document.createElement("a");
    a.href = `${base}/download?format=${format}`;
    a.rel = "noopener";
    a.click();
    setOpen(false);
  }

  function openPrint() {
    window.open(`${base}/print`, "_blank", "noopener");
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      {variant === "compact" ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          disabled={disabled}
          className="flex items-center justify-center w-[18px] h-[18px] rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="Télécharger le contenu de ce concurrent"
          aria-label="Télécharger le contenu"
        >
          <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 3v10m0 0l-4-4m4 4l4-4M4 17h12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="px-3 py-[6px] rounded-[var(--radius-xs)] text-[11px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={disabled ? "Contenu non disponible (brief antérieur à la persistance contenu)" : "Télécharger le contenu de ce concurrent"}
        >
          {open ? "▲" : "▼"} Télécharger
        </button>
      )}

      {open && !disabled && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] py-1 min-w-[180px]">
          <Item onClick={() => download("html")} primary="HTML" secondary=".html du contenu" />
          <Item onClick={() => download("docx")} primary="Word" secondary=".docx Office Open XML" />
          <Item onClick={openPrint} primary="PDF" secondary="Aperçu navigateur → Save as PDF" />
        </div>
      )}
    </div>
  );
}

function Item({
  onClick,
  primary,
  secondary,
}: {
  onClick: () => void;
  primary: string;
  secondary: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col items-start gap-[1px] px-3 py-[6px] text-left hover:bg-[var(--bg-warm)] transition-colors cursor-pointer"
    >
      <span className="text-[12px] font-semibold">{primary}</span>
      <span className="text-[10px] text-[var(--text-muted)]">{secondary}</span>
    </button>
  );
}
