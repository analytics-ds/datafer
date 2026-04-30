"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { faviconUrl } from "@/lib/favicon";
import { relativeDate } from "@/lib/relative-date";
import {
  attachTagAction,
  createTagAction,
  deleteBriefAction,
  deleteTagAction,
  detachTagAction,
  updateWorkflowStatusAction,
} from "./actions";
import type { WorkflowStatus } from "./workflow-status";
import { StatusPicker } from "./status-picker";
import { TagPicker, type TagDTO } from "./tag-picker";

export type BriefCardData = {
  id: string;
  keyword: string;
  country: string;
  score: number | null;
  createdAt: Date | number | null;
  volume: number | null;
  competition: number | null;
  kgr: number | null;
  position: number | null;
  workflowStatus: WorkflowStatus;
  tags: TagDTO[];
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
  availableTags,
}: {
  brief: BriefCardData;
  folders: FolderOption[];
  availableTags: TagDTO[];
}) {
  const router = useRouter();
  const [currentFolder, setCurrentFolder] = useState(brief.folder);
  const [status, setStatus] = useState<WorkflowStatus>(brief.workflowStatus);
  const [tags, setTags] = useState<TagDTO[]>(brief.tags);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [deleting, startDelete] = useTransition();

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

  function onDelete() {
    startDelete(async () => {
      await deleteBriefAction(brief.id);
      router.refresh();
      setConfirmOpen(false);
    });
  }

  async function onStatusChange(next: WorkflowStatus) {
    const prev = status;
    setStatus(next);
    const res = await updateWorkflowStatusAction(brief.id, next);
    if (!res.ok) setStatus(prev);
    else router.refresh();
  }

  async function onAttachTag(tagId: string) {
    const tag = availableTags.find((t) => t.id === tagId);
    if (!tag) return;
    setTags((t) => (t.some((x) => x.id === tagId) ? t : [...t, tag]));
    const res = await attachTagAction(brief.id, tagId);
    if (!res.ok) setTags((t) => t.filter((x) => x.id !== tagId));
    else router.refresh();
  }

  async function onDetachTag(tagId: string) {
    const removed = tags.find((t) => t.id === tagId);
    setTags((t) => t.filter((x) => x.id !== tagId));
    const res = await detachTagAction(brief.id, tagId);
    if (!res.ok && removed) setTags((t) => [...t, removed]);
    else router.refresh();
  }

  async function onCreateTag(name: string, color: string): Promise<TagDTO | null> {
    const res = await createTagAction(brief.id, name, color);
    if (!res.ok) return null;
    setTags((curr) => (curr.some((x) => x.id === res.tag.id) ? curr : [...curr, res.tag]));
    const attach = await attachTagAction(brief.id, res.tag.id);
    if (!attach.ok) {
      setTags((curr) => curr.filter((x) => x.id !== res.tag.id));
      return null;
    }
    router.refresh();
    return res.tag;
  }

  const countryLabel = COUNTRY_LABELS[brief.country] ?? brief.country.toUpperCase();
  return (
    <div
      className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] px-5 py-4 hover:border-[var(--border-strong)] transition-colors"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="grid grid-cols-[64px_1fr_auto] items-start gap-4">
        <ScoreGauge score={brief.score ?? 0} />

        <div className="min-w-0 flex flex-col gap-[8px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/app/briefs/${brief.id}`}
                className="font-semibold text-[15px] leading-tight hover:underline truncate block"
              >
                {brief.keyword}
              </Link>
              <div className="flex items-center gap-[8px] mt-[3px] text-[11px] text-[var(--text-muted)]">
                <FolderPickerInline
                  current={currentFolder}
                  folders={folders}
                  onChange={onFolderChange}
                />
                <span>·</span>
                <span className="inline-flex items-center gap-[4px]">
                  <GlobeIcon />
                  {countryLabel}
                </span>
                <span>·</span>
                <span className="font-[family-name:var(--font-mono)]">
                  {relativeDate(brief.createdAt)}
                </span>
              </div>
            </div>
            <StatusPicker status={status} onChange={onStatusChange} size="sm" />
          </div>

          <div className="flex items-center gap-[14px] text-[12px] text-[var(--text-secondary)]">
            <Metric
              label="Volume"
              value={brief.volume != null ? fmtNum(brief.volume) : "N/A"}
              tone={brief.volume != null ? "default" : "muted"}
            />
            <Sep />
            <Metric
              label="KGR"
              value={brief.kgr != null ? brief.kgr.toFixed(2) : "N/A"}
              // Vert quand le KGR est bon (opportunité), neutre sinon. Pas de
              // rouge : un KGR élevé n'est pas une « erreur », juste un signal.
              tone={brief.kgr != null && brief.kgr < 0.25 ? "good" : "default"}
              tooltip='Keyword Golden Ratio. < 0.25 excellent (opportunité forte).'
            />
            <Sep />
            <Metric
              label="Position"
              value={brief.position != null ? `#${brief.position}` : "N/A"}
              tone={positionTone(brief.position) as "good" | "warn" | "bad" | "best" | "muted"}
              tooltip={
                brief.folder?.website
                  ? `Position de ${brief.folder.website} dans Google (top 100).`
                  : "Rattache un client avec un site pour suivre ta position."
              }
            />
          </div>

          <div className="flex items-center gap-[6px] flex-wrap">
            <TagPicker
              attached={tags}
              available={availableTags}
              onAttach={onAttachTag}
              onDetach={onDetachTag}
              onCreate={onCreateTag}
              onDeleteTag={async (tagId) => {
                await deleteTagAction(tagId);
                setTags((curr) => curr.filter((t) => t.id !== tagId));
                router.refresh();
              }}
              size="sm"
              disabledReason={
                brief.folder
                  ? null
                  : "Rattache le brief à un client pour ajouter des tags."
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            aria-label="Supprimer le brief"
            title="Supprimer le brief"
            className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--red)] hover:border-[var(--red)]/40 hover:bg-[var(--red-bg)] transition-all ${
              hover ? "opacity-100" : "opacity-0"
            }`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {confirmOpen && (
        <DeleteBriefConfirm
          keyword={brief.keyword}
          pending={deleting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  tooltip,
}: {
  label: string;
  value: string;
  tone: "default" | "muted" | "good" | "warn" | "bad" | "best";
  tooltip?: string;
}) {
  const colors: Record<string, string> = {
    default: "var(--text)",
    muted: "var(--text-muted)",
    good: "var(--green)",
    warn: "var(--orange)",
    bad: "var(--red)",
    best: "#0E5132",
  };
  return (
    <span
      title={tooltip}
      className="inline-flex items-baseline gap-[6px]"
      style={{ cursor: tooltip ? "help" : "default" }}
    >
      <span className="text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)]">
        {label}
      </span>
      <span
        className="font-[family-name:var(--font-mono)] font-semibold"
        style={{ color: colors[tone] }}
      >
        {value}
      </span>
    </span>
  );
}

function Sep() {
  return <span className="text-[var(--border-strong)]">·</span>;
}

function DeleteBriefConfirm({
  keyword,
  pending,
  onCancel,
  onConfirm,
}: {
  keyword: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => !pending && onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-7 w-[440px] max-w-full shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-2 mb-3 text-[var(--red)]">
          <TrashIcon />
          <span className="font-semibold text-[16px]">Supprimer ce brief</span>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] mb-5">
          Le brief <strong>« {keyword} »</strong> sera définitivement supprimé : analyse SERP, NLP, contenu rédigé, partage. Cette action est irréversible.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] disabled:opacity-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {pending ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 6h12M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2m1 0v10a1 1 0 01-1 1H7a1 1 0 01-1-1V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type PillTone = "best" | "good" | "warn" | "bad" | "info" | "muted";

// Échelle de couleurs unifiée pour la position SERP : top 3 = vert foncé,
// top 10 = vert normal, top 30 = orange, au-delà = rouge.
export function positionTone(position: number | null): PillTone {
  if (position == null) return "muted";
  if (position <= 3) return "best";
  if (position <= 10) return "good";
  if (position <= 30) return "warn";
  return "bad";
}

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR");
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
        title="Changer le client"
      >
        {current ? <Favicon website={current.website} size={14} /> : <FolderIcon />}
        <span className="font-medium">{current ? current.name : "+ Client"}</span>
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
            <span className="flex-1">Aucun client</span>
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
