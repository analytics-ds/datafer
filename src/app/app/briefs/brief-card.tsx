"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { faviconUrl } from "@/lib/favicon";
import { relativeDate } from "@/lib/relative-date";

export type BriefCardData = {
  id: string;
  keyword: string;
  country: string;
  score: number | null;
  createdAt: Date | number | null;
  author: { id: string; name: string | null; image: string | null } | null;
  folder: { id: string; name: string; website: string | null } | null;
};

export type FolderOption = {
  id: string;
  name: string;
  website: string | null;
};

const COUNTRY_LABELS: Record<string, string> = {
  fr: "France",
  es: "Espagne",
  us: "États-Unis",
  uk: "Royaume-Uni",
  de: "Allemagne",
  it: "Italie",
};

export function BriefCard({
  brief,
  folders,
}: {
  brief: BriefCardData;
  folders: FolderOption[];
}) {
  const router = useRouter();
  const [currentFolder, setCurrentFolder] = useState(brief.folder);

  async function onFolderChange(next: FolderOption | null) {
    const prev = currentFolder;
    setCurrentFolder(next);
    const res = await fetch(`/api/briefs/${brief.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: next?.id ?? null }),
    });
    if (!res.ok) {
      setCurrentFolder(prev);
      return;
    }
    router.refresh();
  }

  return (
    <div className="group grid grid-cols-[76px_1fr_auto] items-center gap-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] px-5 py-4 hover:border-[var(--border-strong)] transition-colors">
      <ScoreGauge score={brief.score ?? 0} />

      <div className="min-w-0">
        <Link
          href={`/app/briefs/${brief.id}`}
          className="font-semibold text-[15px] leading-tight hover:underline truncate block"
        >
          {brief.keyword}
        </Link>
        <div className="flex items-center gap-2 mt-[6px] text-[12px] text-[var(--text-secondary)] flex-wrap">
          <span className="inline-flex items-center gap-[5px]">
            <GlobeIcon />
            {COUNTRY_LABELS[brief.country] ?? brief.country.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-[6px]">
          <FolderPickerInline
            current={currentFolder}
            folders={folders}
            onChange={onFolderChange}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <AuthorAvatar author={brief.author} />
        <span className="text-[12px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] shrink-0">
          {relativeDate(brief.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Score gauge (demi-cercle) ─────────────────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const color = score < 40 ? "var(--red)" : score < 70 ? "var(--orange)" : "var(--green)";

  // Arc demi-cercle, rayon 28, centre (32, 32). Longueur ≈ π * r = 88.
  const r = 28;
  const length = Math.PI * r;
  const offset = length - (Math.max(0, Math.min(100, score)) / 100) * length;

  return (
    <div className="relative w-[64px] h-[44px]">
      <svg viewBox="0 0 64 44" className="w-full h-full">
        <path
          d={`M 4 38 A ${r} ${r} 0 0 1 60 38`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d={`M 4 38 A ${r} ${r} 0 0 1 60 38`}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-end justify-center pb-[1px] font-[family-name:var(--font-mono)] font-semibold text-[14px]"
        style={{ color }}
      >
        {score}
      </div>
    </div>
  );
}

// ─── Folder picker inline (changer le dossier du brief) ────────────────────
function FolderPickerInline({
  current,
  folders,
  onChange,
}: {
  current: { id: string; name: string; website: string | null } | null;
  folders: FolderOption[];
  onChange: (f: FolderOption | null) => void;
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-[6px] px-[10px] py-[3px] text-[12px] text-[var(--text-secondary)] bg-[var(--bg)] hover:bg-[var(--bg-warm)] border border-[var(--border)] rounded-[var(--radius-xs)] transition-colors"
        title="Changer le dossier"
      >
        {current ? <Favicon website={current.website} size={14} /> : <FolderIcon />}
        <span className="font-medium">{current ? current.name : "+ Dossier"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] min-w-[220px] max-h-[260px] overflow-y-auto py-1">
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`w-full flex items-center gap-[10px] px-3 py-[7px] text-[13px] text-left hover:bg-[var(--bg-warm)] transition-colors ${
              !current ? "bg-[var(--bg-warm)] font-semibold" : "text-[var(--text-muted)]"
            }`}
          >
            <span className="w-4 h-4 rounded-[3px] bg-[var(--bg-warm)] text-[var(--text-muted)] flex items-center justify-center text-[10px] shrink-0">·</span>
            <span className="flex-1">Aucun dossier</span>
            {!current && <span className="text-[var(--accent-dark)] text-[12px]">✓</span>}
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                onChange(f);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-[10px] px-3 py-[7px] text-[13px] text-left hover:bg-[var(--bg-warm)] transition-colors ${
                current?.id === f.id ? "bg-[var(--bg-warm)] font-semibold" : ""
              }`}
            >
              <Favicon website={f.website} size={16} />
              <span className="flex-1 truncate">{f.name}</span>
              {current?.id === f.id && <span className="text-[var(--accent-dark)] text-[12px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Author avatar ─────────────────────────────────────────────────────────
function AuthorAvatar({ author }: { author: BriefCardData["author"] }) {
  if (!author) return null;
  const initials = (author.name ?? "?").slice(0, 1).toUpperCase();
  if (author.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.image}
        alt={author.name ?? ""}
        title={author.name ?? ""}
        className="w-7 h-7 rounded-full object-cover border border-[var(--border)]"
      />
    );
  }
  return (
    <div
      title={author.name ?? ""}
      className="w-7 h-7 rounded-full bg-[var(--bg-olive-light)] text-[var(--accent-dark)] flex items-center justify-center text-[11px] font-semibold border border-[var(--border)]"
    >
      {initials}
    </div>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────────
function Favicon({ website, size }: { website: string | null; size: number }) {
  const src = faviconUrl(website, Math.max(size * 2, 32));
  if (!src) {
    return (
      <span
        className="rounded-[3px] bg-[var(--bg-warm)] text-[var(--text-muted)] flex items-center justify-center text-[9px] shrink-0"
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

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 6a1 1 0 011-1h3l2 2h7a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 10h14M10 3c2.5 3 2.5 11 0 14M10 3c-2.5 3-2.5 11 0 14" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
