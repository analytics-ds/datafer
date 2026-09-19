"use client";

import { useEffect, useRef, useState } from "react";
import {
  CaretDownIcon,
  TextAlignLeftIcon,
  ListBulletsIcon,
  HighlighterIcon,
  ImageIcon,
  CodeIcon,
  TableIcon,
  LinkIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
} from "@/components/icons";
import { useT } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n";

const HIGHLIGHT_COLORS = [
  { value: "", labelKey: "toolbar.highlight.none", swatch: "transparent", border: true },
  // Surlignage reduit aux couleurs secondaires de la charte, en voile clair
  // pour garder un texte noir lisible par-dessus. Les surlignages deja
  // enregistres dans d'anciens briefs gardent leur couleur d'origine.
  { value: "#FFFF7D", labelKey: "toolbar.highlight.yellow", swatch: "#FFFF7D" },
  { value: "rgba(119,176,237,0.35)", labelKey: "toolbar.highlight.blue", swatch: "rgba(119,176,237,0.35)" },
  { value: "rgba(173,172,47,0.3)", labelKey: "toolbar.highlight.khaki", swatch: "rgba(173,172,47,0.3)" },
  { value: "#E8E8E8", labelKey: "toolbar.highlight.grey", swatch: "#E8E8E8" },
];

/** Tags de bloc applicables depuis la toolbar / les raccourcis clavier. */
export type BlockTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
const shortcutLabel = (n: number) => (IS_MAC ? `⌥⌘${n}` : `Ctrl+Alt+${n}`);

const HEADINGS: Array<{ tag: BlockTag; labelKey: TranslationKey; className: string; shortcut: string }> = [
  { tag: "h1", labelKey: "toolbar.heading.h1", className: "text-[20px] font-bold", shortcut: shortcutLabel(1) },
  { tag: "h2", labelKey: "toolbar.heading.h2", className: "text-[16px] font-semibold", shortcut: shortcutLabel(2) },
  { tag: "h3", labelKey: "toolbar.heading.h3", className: "text-[14px] font-semibold", shortcut: shortcutLabel(3) },
  { tag: "h4", labelKey: "toolbar.heading.h4", className: "text-[13px] font-semibold", shortcut: shortcutLabel(4) },
  { tag: "h5", labelKey: "toolbar.heading.h5", className: "text-[12px] font-semibold", shortcut: shortcutLabel(5) },
  { tag: "h6", labelKey: "toolbar.heading.h6", className: "text-[11px] font-semibold", shortcut: shortcutLabel(6) },
  { tag: "p", labelKey: "toolbar.heading.p", className: "text-[14px] text-[var(--text-secondary)]", shortcut: shortcutLabel(0) },
];

const TABLE_GRID_ROWS = 8;
const TABLE_GRID_COLS = 10;
const MAX_IMAGE_BYTES = 1_500_000;

type ToolbarProps = {
  currentTag: BlockTag | null;
  onExec: (cmd: string, value?: string) => void;
  onApplyHeading: (tag: BlockTag) => void;
  onInsertImage: (src: string, alt: string) => void;
  onInsertTable: (rows: number, cols: number) => void;
  onInsertLink: () => void;
  onHighlight: (color: string) => void;
  /** Mode source HTML actif (textarea brute au lieu du WYSIWYG). */
  htmlMode?: boolean;
  /** Bascule entre WYSIWYG et source HTML. */
  onToggleHtmlMode?: () => void;
};

export function EditorToolbar(p: ToolbarProps) {
  const t = useT();
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
    p.currentTag && p.currentTag !== "p" ? p.currentTag.toUpperCase() : "¶";

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
          title={t("toolbar.headingLevel")}
        >
          <span className="font-mono text-[12px] font-bold">
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
                <span className="flex items-center justify-between gap-4 w-full">
                  <span className={h.className}>{t(h.labelKey)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">
                    {h.shortcut}
                  </span>
                </span>
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>

      <Sep />

      {/* Inline formatting */}
      <TbBtn onClick={() => p.onExec("bold")} title={t("toolbar.bold")}>
        <b>B</b>
      </TbBtn>
      <TbBtn onClick={() => p.onExec("italic")} title={t("toolbar.italic")}>
        <i>I</i>
      </TbBtn>
      <TbBtn onClick={() => p.onExec("underline")} title={t("toolbar.underline")}>
        <u>U</u>
      </TbBtn>
      <TbBtn onClick={() => p.onExec("strikeThrough")} title={t("toolbar.strike")}>
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
          title={t("toolbar.align")}
        >
          <TextAlignLeftIcon size={15} />
          <Chevron />
        </button>
        {alignOpen && (
          <Menu>
            <MenuItem onClick={() => { p.onExec("justifyLeft"); setAlignOpen(false); }}>{t("toolbar.align.left")}</MenuItem>
            <MenuItem onClick={() => { p.onExec("justifyCenter"); setAlignOpen(false); }}>{t("toolbar.align.center")}</MenuItem>
            <MenuItem onClick={() => { p.onExec("justifyRight"); setAlignOpen(false); }}>{t("toolbar.align.right")}</MenuItem>
            <MenuItem onClick={() => { p.onExec("justifyFull"); setAlignOpen(false); }}>{t("toolbar.align.justify")}</MenuItem>
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
          title={t("toolbar.list")}
        >
          <ListBulletsIcon size={15} />
          <Chevron />
        </button>
        {listOpen && (
          <Menu>
            <MenuItem onClick={() => { p.onExec("insertUnorderedList"); setListOpen(false); }}>{t("toolbar.list.bullets")}</MenuItem>
            <MenuItem onClick={() => { p.onExec("insertOrderedList"); setListOpen(false); }}>{t("toolbar.list.numbered")}</MenuItem>
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
          title={t("toolbar.highlight")}
        >
          <HighlighterIcon size={15} />
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
                {t(c.labelKey as TranslationKey)}
              </button>
            ))}
          </Menu>
        )}
      </div>

      {/* Image */}
      <TbBtn onClick={() => setImageOpen(true)} title={t("toolbar.image")}>
        <ImageIcon size={15} />
      </TbBtn>

      {/* HTML source toggle */}
      {p.onToggleHtmlMode && (
        <button
          onClick={p.onToggleHtmlMode}
          className={"tb-btn" + (p.htmlMode ? " tb-btn-active" : "")}
          title={
            p.htmlMode
              ? t("toolbar.html.back")
              : t("toolbar.html.edit")
          }
        >
          <CodeIcon size={15} />
        </button>
      )}

      {/* Table — grid selector */}
      <div className="relative">
        <button
          onClick={() => {
            const next = !tableOpen;
            closeAll();
            setTableOpen(next);
          }}
          className="tb-btn"
          title={t("toolbar.table")}
        >
          <TableIcon size={15} />
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
      <TbBtn onClick={p.onInsertLink} title={t("toolbar.link")}>
        <LinkIcon size={15} />
      </TbBtn>

      <Sep />

      {/* Undo / Redo */}
      <TbBtn onClick={() => p.onExec("undo")} title={t("toolbar.undo")}>
        <ArrowUUpLeftIcon size={15} />
      </TbBtn>
      <TbBtn onClick={() => p.onExec("redo")} title={t("toolbar.redo")}>
        <ArrowUUpRightIcon size={15} />
      </TbBtn>

      <Sep />

      {/* Remove formatting */}
      <TbBtn onClick={() => p.onExec("removeFormat")} title={t("toolbar.clearFormat")}>
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
        :global(.tb-btn-active),
        :global(.tb-btn-active:hover) {
          background: var(--bg-black);
          color: var(--text-inverse);
        }
      `}</style>
    </div>
  );
}

function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const t = useT();
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
      <div className="text-center text-[12px] font-mono text-[var(--text-secondary)]">
        {hover ? `${hover.r + 1} × ${hover.c + 1}` : t("toolbar.table.size")}
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
  const t = useT();
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
      setError(t("toolbar.image.error.type"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("toolbar.image.error.size", { size: (file.size / 1024 / 1024).toFixed(2), limit: (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1) }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError(t("toolbar.image.error.read"));
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
          aria-label={t("common.close")}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)]"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <h3 className="df-title text-[18px] mb-4">{t("toolbar.image.title")}</h3>

        <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
          {[
            { id: "url" as const, label: t("toolbar.image.fromUrl") },
            { id: "upload" as const, label: t("toolbar.image.upload") },
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
              <label className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[5px] block">
                URL de l&apos;image
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("toolbar.image.urlPlaceholder")}
                autoFocus
                className="w-full px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--accent-dark)] transition-colors text-[13px] font-mono"
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
                {t("toolbar.image.dropzone")}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {t("toolbar.image.formats", { limit: (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1) })}
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[5px]">
              {t("toolbar.image.preview")}
            </div>
            <div className="border border-[var(--border)] rounded-[var(--radius-xs)] bg-[var(--bg)] p-2 max-h-[200px] overflow-hidden flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={alt} className="max-h-[180px] max-w-full object-contain" />
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[5px] block">
            {t("toolbar.image.alt")}{" "}
            <span className="text-[var(--text-muted)] normal-case font-normal">
              {t("toolbar.image.alt.hint")}
            </span>
          </label>
          <input
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder={t("toolbar.image.altPlaceholder")}
            className="w-full px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--accent-dark)] transition-colors text-[13px]"
          />
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!canInsert}
            className="px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--bg-black)] text-[var(--text-inverse)] hover:bg-[var(--bg-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("toolbar.image.insert")}
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
  return <CaretDownIcon size={10} />;
}
