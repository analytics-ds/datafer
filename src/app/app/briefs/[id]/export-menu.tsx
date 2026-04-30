"use client";

import { useEffect, useRef, useState } from "react";

export function ExportMenu({
  exportEndpoint,
  printUrl,
}: {
  exportEndpoint: string;
  printUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function download(format: "html" | "doc") {
    const url = `${exportEndpoint}?format=${format}`;
    // download attribute permet au navigateur d'utiliser le filename donné
    // par Content-Disposition côté serveur. On ouvre dans un iframe caché
    // pour ne pas naviguer hors de la page.
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.click();
    setOpen(false);
  }

  function openPrint() {
    window.open(printUrl, "_blank", "noopener");
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-[6px] px-3 py-[8px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[12px] font-semibold hover:bg-[var(--bg-warm)] transition-colors cursor-pointer"
        title="Exporter le contenu rédigé"
      >
        <DownloadIcon />
        Exporter
        <svg width="9" height="9" viewBox="0 0 20 20" fill="none">
          <path
            d="M5 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] py-1 min-w-[200px]">
          <ExportItem
            onClick={() => download("html")}
            primary="HTML"
            secondary=".html prêt à publier"
          />
          <ExportItem
            onClick={() => download("doc")}
            primary="Word"
            secondary=".doc lisible Word & Pages"
          />
          <ExportItem
            onClick={openPrint}
            primary="PDF"
            secondary="Aperçu navigateur → Enregistrer en PDF"
          />
        </div>
      )}
    </div>
  );
}

function ExportItem({
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
      className="w-full flex flex-col items-start gap-[2px] px-3 py-[8px] text-left hover:bg-[var(--bg-warm)] transition-colors"
    >
      <span className="text-[13px] font-semibold">{primary}</span>
      <span className="text-[11px] text-[var(--text-muted)]">{secondary}</span>
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 3v10m0 0l-4-4m4 4l4-4M4 17h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
