"use client";

import { useEffect, useRef, useState } from "react";

const HIGHLIGHT_COLORS = [
  { value: "", label: "Aucun", swatch: "transparent", border: true },
  { value: "#FFF4A3", label: "Jaune", swatch: "#FFF4A3" },
  { value: "#FFD4B2", label: "Orange", swatch: "#FFD4B2" },
  { value: "#FFCCCC", label: "Rouge", swatch: "#FFCCCC" },
  { value: "#D4F0C7", label: "Vert", swatch: "#D4F0C7" },
  { value: "#C7E0F5", label: "Bleu", swatch: "#C7E0F5" },
  { value: "#E0D4F5", label: "Violet", swatch: "#E0D4F5" },
];

const HEADINGS: Array<{ tag: "h1" | "h2" | "h3" | "p"; label: string; className: string }> = [
  { tag: "h1", label: "H1 · Titre principal", className: "text-[20px] font-bold" },
  { tag: "h2", label: "H2 · Sous-titre", className: "text-[16px] font-semibold" },
  { tag: "h3", label: "H3 · Section", className: "text-[14px] font-semibold" },
  { tag: "p", label: "¶ Paragraphe", className: "text-[14px] text-[var(--text-secondary)]" },
];

const TABLE_GRID_ROWS = 8;
const TABLE_GRID_COLS = 10;
const MAX_IMAGE_BYTES = 1_500_000;

type ToolbarProps = {
  currentTag: "h1" | "h2" | "h3" | "p" | null;
  onExec: (cmd: string, value?: string) => void;
  onApplyHeading: (tag: "h1" | "h2" | "h3" | "p") => void;
  onInsertImage: (src: string, alt: string) => void;
  onInsertTable: (rows: number, cols: number) => void;
  onInsertLink: () => void;
  onHighlight: (color: string) => void;
};

export function EditorToolbar(p: ToolbarProps) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const closeAll = () => {
    setHeadingOpen(false);
    setAlignOpen(false);
    setListOpen(false);
    setHighlightOpen(false);
    setTableOpen(false);
  };

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) closeAll();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const currentHeadingLabel =
    p.currentTag === "h1"
      ? "H1"
      : p.currentTag === "h2"
        ? "H2"
        : p.currentTag === "h3"
          ? "H3"
          : "¶";

  return (
    <div
      ref={ref}
      className="flex items-center gap-[2px] px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)] flex-wrap"
    >
      {/* Heading dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            const next = !headingOpen;
            closeAll();
            setHeadingOpen(next);
          }}
          className="tb-btn min-w-[48px] px-2 gap-1"
          title="Niveau de titre"
        >
          <span className="font-[family-name:var(--font-mono)] text-[12px] font-bold">
            {currentHeadingLabel}
          </span>
          <Chevron />
        </button>
        {headingOpen && (
          <Menu>
            {HEADINGS.map((h) => (
              <MenuItem
                key={h.tag}
                onClick={() => {
                  p.onApplyHeading(h.tag);
                  setHeadingOpen(false);
                }}
              >
                <span className={h.className}>{h.label}</span>
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>

      <Sep />

      {/* Inline formatting */}
      <TbBtn onClick={() => p.onExec("bold")} title="Gras (Ctrl+B)">
        <b>B</b>
      </TbBtn>
      <TbBtn onClick={() => p.onExec("italic")} title="Italique (Ctrl+I)">
        <i>I</i>
      </TbBtn>
      <TbBtn onClick={() => p.onExec("underline")} title="Souligné (Ctrl+U)">
        <u>U</u>
      </TbBtn>
      <TbBtn onClick={() => p.onExec("strikeThrough")} title="Barré">
        <s>S</s>
      </TbBtn>

      <Sep />

      {/* Alignment */}
      <div className="relative">
        <button
          onClick={() => {
            const next = !alignOpen;
            closeAll();
            setAlignOpen(next);
          }}
          className="tb-btn gap-1"
          title="Alignement"
        >
          <AlignIcon />
          <Chevron />
        </button>
        {alignOpen && (
          <Menu>
            <MenuItem onClick={() => { p.onExec("justifyLeft"); setAlignOpen(false); }}>Aligner à gauche</MenuItem>
            <MenuItem onClick={() => { p.onExec("justifyCenter"); setAlignOpen(false); }}>Centrer</MenuItem>
            <MenuItem onClick={() => { p.onExec("justifyRight"); setAlignOpen(false); }}>Aligner à droite</MenuItem>
            <MenuItem onClick={() => { p.onExec("justifyFull"); setAlignOpen(false); }}>Justifier</MenuItem>
          </Menu>
        )}
      </div>

      {/* Lists */}
      <div className="relative">
        <button
          onClick={() => {
            const next = !listOpen;
            closeAll();
            setListOpen(next);
          }}
          className="tb-btn gap-1"
          title="Liste"
        >
          <ListIcon />
          <Chevron />
        </button>
        {listOpen && (
          <Menu>
            <MenuItem onClick={() => { p.onExec("insertUnorderedList"); setListOpen(false); }}>Liste à puces</MenuItem>
            <MenuItem onClick={() => { p.onExec("insertOrderedList"); setListOpen(false); }}>Liste numérotée</MenuItem>
          </Menu>
        )}
      </div>

      <Sep />

      {/* Highlight */}
      <div className="relative">
        <button
          onClick={() => {
            const next = !highlightOpen;
            closeAll();
            setHighlightOpen(next);
          }}
          className="tb-btn gap-1"
          title="Surlignage"
        >
          <HighlightIcon />
          <Chevron />
        </button>
        {highlightOpen && (
          <Menu width={180}>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value || "none"}
                onClick={() => { p.onHighlight(c.value); setHighlightOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-[7px] text-[13px] text-left hover:bg-[var(--bg-warm)] transition-colors"
              >
                <span
                  className={`w-5 h-5 rounded-[3px] ${c.border ? "border border-[var(--border-strong)]" : ""}`}
                  style={{ background: c.swatch }}
                />
                {c.label}
              </button>
            ))}
          </Menu>
        )}
      </div>

      {/* Image */}
      <TbBtn onClick={() => setImageOpen(true)} title="Insérer une image">
        <ImageIcon />
      </TbBtn>

      {/* Table — grid selector */}
      <div className="relative">
        <button
          onClick={() => {
            const next = !tableOpen;
            closeAll();
            setTableOpen(next);
          }}
          className="tb-btn"
          title="Insérer un tableau"
        >
          <TableIcon />
        </button>
        {tableOpen && (
          <TableGridPicker
            onPick={(rows, cols) => {
              p.onInsertTable(rows, cols);
              setTableOpen(false);
            }}
          />
        )}
      </div>

      {/* Link */}
      <TbBtn onClick={p.onInsertLink} title="Insérer un lien">
        <LinkIcon />
      </TbBtn>

      <Sep />

      {/* Undo / Redo */}
      <TbBtn onClick={() => p.onExec("undo")} title="Annuler (Ctrl+Z)">
        <UndoIcon />
      </TbBtn>
      <TbBtn onClick={() => p.onExec("redo")} title="Rétablir (Ctrl+Shift+Z)">
        <RedoIcon />
      </TbBtn>

      <Sep />

      {/* Remove formatting */}
      <TbBtn onClick={() => p.onExec("removeFormat")} title="Supprimer le formatage">
        ✕
      </TbBtn>

      {imageOpen && (
        <ImageInsertModal
          onClose={() => setImageOpen(false)}
          onInsert={(src, alt) => {
            p.onInsertImage(src, alt);
            setImageOpen(false);
          }}
        />
      )}

      <style jsx>{`
        :global(.tb-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 32px;
          height: 32px;
          padding: 0 6px;
          border: none;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 700;
          transition: all 0.15s;
        }
        :global(.tb-btn:hover) {
          background: var(--bg-card);
          color: var(--text);
        }
      `}</style>
    </div>
  );
}

function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  return (
    <div
      className="absolute top-10 left-0 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] p-3"
      onMouseLeave={() => setHover(null)}
    >
      <div
        className="grid gap-[2px] mb-2"
        style={{ gridTemplateColumns: `repeat(${TABLE_GRID_COLS}, 16px)` }}
      >
        {Array.from({ length: TABLE_GRID_ROWS * TABLE_GRID_COLS }).map((_, i) => {
          const r = Math.floor(i / TABLE_GRID_COLS);
          const c = i % TABLE_GRID_COLS;
          const active = hover && r <= hover.r && c <= hover.c;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => onPick(hover ? hover.r + 1 : r + 1, hover ? hover.c + 1 : c + 1)}
              className="w-4 h-4 rounded-[2px] border transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--bg)",
                borderColor: active ? "var(--accent-dark)" : "var(--border)",
              }}
              aria-label={`${r + 1} lignes × ${c + 1} colonnes`}
            />
          );
        })}
      </div>
      <div className="text-center text-[12px] font-[family-name:var(--font-mono)] text-[var(--text-secondary)]">
        {hover ? `${hover.r + 1} × ${hover.c + 1}` : "Choisis la taille"}
      </div>
    </div>
  );
}

function ImageInsertModal({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (src: string, alt: string) => void;
}) {
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function ingestFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Le fichier doit être une image (JPG, PNG, WebP, GIF, SVG).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image trop lourde : ${(file.size / 1024 / 1024).toFixed(2)} Mo. Limite : ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)} Mo.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError("Lecture du fichier impossible.");
    reader.readAsDataURL(file);
  }

  const preview = tab === "url" ? (url || null) : dataUrl;
  const canInsert = !!preview;

  function handleInsert() {
    if (!preview) return;
    onInsert(preview, alt.trim());
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow-lg)] w-[520px] max-w-full max-h-[85vh] overflow-y-auto p-6 pt-8 relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)]"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <h3 className="font-[family-name:var(--font-display)] text-[18px] mb-4">Insérer une image</h3>

        <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
          {[
            { id: "url" as const, label: "Depuis une URL" },
            { id: "upload" as const, label: "Téléverser un fichier" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setError(null); }}
              className={`px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[var(--text)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "url" && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] mb-[5px] block">
                URL de l&apos;image
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://exemple.com/image.jpg"
                autoFocus
                className="w-full px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--accent-dark)] transition-colors text-[13px] font-[family-name:var(--font-mono)]"
              />
            </div>
          </div>
        )}

        {tab === "upload" && (
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                ingestFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-[var(--radius-sm)] p-7 text-center cursor-pointer transition-colors ${
                dragging
                  ? "border-[var(--accent-dark)] bg-[var(--bg-olive-light)]"
                  : "border-[var(--border-strong)] hover:border-[var(--text-muted)] bg-[var(--bg)]"
              }`}
            >
              <div className="text-[13px] font-semibold mb-1">
                Glisse une image ici ou clique pour parcourir
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                JPG, PNG, WebP, GIF, SVG · max {(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)} Mo
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => ingestFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 text-[12px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/30 rounded-[var(--radius-xs)] px-3 py-2">
            {error}
          </div>
        )}

        {preview && (
          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] mb-[5px]">
              Aperçu
            </div>
            <div className="border border-[var(--border)] rounded-[var(--radius-xs)] bg-[var(--bg)] p-2 max-h-[200px] overflow-hidden flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={alt} className="max-h-[180px] max-w-full object-contain" />
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] mb-[5px] block">
            Texte alternatif (alt) <span className="text-[var(--text-muted)] normal-case font-normal">— recommandé pour le SEO</span>
          </label>
          <input
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Description courte de l'image"
            className="w-full px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--accent-dark)] transition-colors text-[13px]"
          />
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!canInsert}
            className="px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--bg-black)] text-[var(--text-inverse)] hover:bg-[var(--bg-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Insérer l&apos;image
          </button>
        </div>
      </div>
    </div>
  );
}

function TbBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="tb-btn" title={title}>
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-6 bg-[var(--border)] mx-[6px]" />;
}

function Menu({ children, width = 220 }: { children: React.ReactNode; width?: number }) {
  return (
    <div
      className="absolute top-10 left-0 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] z-30 py-1"
      style={{ minWidth: width }}
    >
      {children}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-[7px] rounded-md hover:bg-[var(--bg-warm)] transition-colors text-[13px]"
    >
      {children}
    </button>
  );
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlignIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M3 5h14M3 10h10M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M7 5h10M7 10h10M7 15h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="4" cy="5" r="1" fill="currentColor" />
      <circle cx="4" cy="10" r="1" fill="currentColor" />
      <circle cx="4" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M4 15l3-3 5 5-3 3H4v-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 12l6-6 4 4-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2 19h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7" cy="8" r="1.3" fill="currentColor" />
      <path d="M3 14l4-4 4 4 3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 8h15M2.5 13h15M8 3.5v13M13 3.5v13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M9 11a3 3 0 004 0l3-3a3 3 0 00-4-4l-1 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 9a3 3 0 00-4 0l-3 3a3 3 0 004 4l1-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M6 9L3 6l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 6h9a5 5 0 010 10H7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RedoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path d="M14 9l3-3-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 6H8a5 5 0 000 10h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
