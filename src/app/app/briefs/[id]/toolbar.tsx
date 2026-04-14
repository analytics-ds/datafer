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

type ToolbarProps = {
  currentTag: "h1" | "h2" | "h3" | "p" | null;
  onExec: (cmd: string, value?: string) => void;
  onApplyHeading: (tag: "h1" | "h2" | "h3" | "p") => void;
  onInsertImage: () => void;
  onInsertTable: () => void;
  onInsertLink: () => void;
  onHighlight: (color: string) => void;
};

export function EditorToolbar(p: ToolbarProps) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setHeadingOpen(false);
        setAlignOpen(false);
        setListOpen(false);
        setHighlightOpen(false);
      }
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
            setHeadingOpen((v) => !v);
            setAlignOpen(false);
            setListOpen(false);
            setHighlightOpen(false);
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
            setAlignOpen((v) => !v);
            setHeadingOpen(false);
            setListOpen(false);
            setHighlightOpen(false);
          }}
          className="tb-btn gap-1"
          title="Alignement"
        >
          <AlignIcon />
          <Chevron />
        </button>
        {alignOpen && (
          <Menu>
            <MenuItem
              onClick={() => {
                p.onExec("justifyLeft");
                setAlignOpen(false);
              }}
            >
              Aligner à gauche
            </MenuItem>
            <MenuItem
              onClick={() => {
                p.onExec("justifyCenter");
                setAlignOpen(false);
              }}
            >
              Centrer
            </MenuItem>
            <MenuItem
              onClick={() => {
                p.onExec("justifyRight");
                setAlignOpen(false);
              }}
            >
              Aligner à droite
            </MenuItem>
            <MenuItem
              onClick={() => {
                p.onExec("justifyFull");
                setAlignOpen(false);
              }}
            >
              Justifier
            </MenuItem>
          </Menu>
        )}
      </div>

      {/* Lists */}
      <div className="relative">
        <button
          onClick={() => {
            setListOpen((v) => !v);
            setAlignOpen(false);
            setHeadingOpen(false);
            setHighlightOpen(false);
          }}
          className="tb-btn gap-1"
          title="Liste"
        >
          <ListIcon />
          <Chevron />
        </button>
        {listOpen && (
          <Menu>
            <MenuItem
              onClick={() => {
                p.onExec("insertUnorderedList");
                setListOpen(false);
              }}
            >
              Liste à puces
            </MenuItem>
            <MenuItem
              onClick={() => {
                p.onExec("insertOrderedList");
                setListOpen(false);
              }}
            >
              Liste numérotée
            </MenuItem>
          </Menu>
        )}
      </div>

      <Sep />

      {/* Highlight */}
      <div className="relative">
        <button
          onClick={() => {
            setHighlightOpen((v) => !v);
            setAlignOpen(false);
            setListOpen(false);
            setHeadingOpen(false);
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
                onClick={() => {
                  p.onHighlight(c.value);
                  setHighlightOpen(false);
                }}
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
      <TbBtn onClick={p.onInsertImage} title="Insérer une image">
        <ImageIcon />
      </TbBtn>

      {/* Table */}
      <TbBtn onClick={p.onInsertTable} title="Insérer un tableau">
        <TableIcon />
      </TbBtn>

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
