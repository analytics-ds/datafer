"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { relativeDate } from "@/lib/relative-date";
import {
  EMPTY_FILTERS,
  FilterBar,
  type FilterState,
} from "@/app/app/briefs/filter-bar";
import { StatusPicker } from "@/app/app/briefs/status-picker";
import { TagPicker, type TagDTO } from "@/app/app/briefs/tag-picker";
import type { WorkflowStatus } from "@/app/app/briefs/workflow-status";
import { scoreColor } from "@/lib/score-color";

export type SharedBriefRow = {
  id: string;
  keyword: string;
  country: string;
  score: number | null;
  createdAt: Date | number | null;
  volume: number | null;
  kgr: number | null;
  position: number | null;
  difficulty: number | null;
  workflowStatus: WorkflowStatus;
  tags: TagDTO[];
};

export function SharedBriefList({
  token,
  briefs,
  availableTags,
}: {
  token: string;
  briefs: SharedBriefRow[];
  availableTags: TagDTO[];
}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const fromTs = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
    const toTs = filters.dateTo
      ? new Date(filters.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;
    return briefs.filter((b) => {
      if (q) {
        const hit =
          b.keyword.toLowerCase().includes(q) ||
          b.tags.some((t) => t.name.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (filters.statuses.length > 0 && !filters.statuses.includes(b.workflowStatus))
        return false;
      if (filters.tagIds.length > 0) {
        const briefTagIds = new Set(b.tags.map((t) => t.id));
        if (!filters.tagIds.every((id) => briefTagIds.has(id))) return false;
      }
      const ts = toTimestamp(b.createdAt);
      if (fromTs != null && (ts == null || ts < fromTs)) return false;
      if (toTs != null && (ts == null || ts > toTs)) return false;
      const sc = b.score ?? 0;
      if (filters.scoreMin != null && sc < filters.scoreMin) return false;
      if (filters.scoreMax != null && sc > filters.scoreMax) return false;
      return true;
    });
  }, [briefs, filters]);

  return (
    <>
      <FilterBar
        state={filters}
        onChange={setFilters}
        availableTags={availableTags}
        searchPlaceholder="Rechercher un mot-clé, un tag, un statut…"
      />
      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-12 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">
            Aucun brief ne correspond aux filtres.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((b) => (
            <SharedBriefCard
              key={b.id}
              token={token}
              brief={b}
              availableTags={availableTags}
            />
          ))}
        </div>
      )}
    </>
  );
}

function SharedBriefCard({
  token,
  brief,
  availableTags,
}: {
  token: string;
  brief: SharedBriefRow;
  availableTags: TagDTO[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<WorkflowStatus>(brief.workflowStatus);
  const [tags, setTags] = useState<TagDTO[]>(brief.tags);

  async function onStatusChange(next: WorkflowStatus) {
    const prev = status;
    setStatus(next);
    const res = await fetch(`/api/share/${token}/briefs/${brief.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowStatus: next }),
    });
    if (!res.ok) setStatus(prev);
    else router.refresh();
  }

  async function onAttach(tagId: string) {
    const tag = availableTags.find((t) => t.id === tagId) ?? tags.find((t) => t.id === tagId);
    if (!tag) return;
    setTags((curr) => (curr.some((x) => x.id === tagId) ? curr : [...curr, tag]));
    const res = await fetch(`/api/share/${token}/briefs/${brief.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) setTags((curr) => curr.filter((x) => x.id !== tagId));
    else router.refresh();
  }

  async function onDetach(tagId: string) {
    const removed = tags.find((t) => t.id === tagId);
    setTags((curr) => curr.filter((x) => x.id !== tagId));
    const res = await fetch(
      `/api/share/${token}/briefs/${brief.id}/tags?tagId=${encodeURIComponent(tagId)}`,
      { method: "DELETE" },
    );
    if (!res.ok && removed) setTags((curr) => [...curr, removed]);
    else router.refresh();
  }

  async function onCreate(name: string, color: string): Promise<TagDTO | null> {
    const res = await fetch(`/api/share/${token}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag?: TagDTO };
    const tag = data.tag;
    if (!tag) return null;
    setTags((curr) => (curr.some((x) => x.id === tag.id) ? curr : [...curr, tag]));
    const attach = await fetch(`/api/share/${token}/briefs/${brief.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    if (!attach.ok) {
      setTags((curr) => curr.filter((x) => x.id !== tag.id));
      return null;
    }
    router.refresh();
    return tag;
  }

  return (
    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] px-5 py-4">
      <Link href={`/share/${token}/brief/${brief.id}`} className="contents">
        <ScoreGauge score={brief.score ?? 0} />
        <div className="min-w-0">
          <div className="font-semibold text-[15px] leading-tight truncate hover:underline">
            {brief.keyword}
          </div>
          <div className="flex items-center gap-[6px] mt-[6px] text-[12px] text-[var(--text-secondary)] flex-wrap">
            <span className="font-mono uppercase text-[11px]">
              {brief.country}
            </span>
            <Pill
              label="Vol"
              value={brief.volume != null ? brief.volume.toLocaleString("fr-FR") : "N/A"}
              tooltip="Volume de recherche mensuel"
              tone={brief.volume != null ? "info" : "muted"}
            />
            <Pill
              label="KD"
              value={brief.difficulty != null ? `${brief.difficulty}/100` : "N/A"}
              tooltip="Keyword Difficulty (Haloscan)"
              tone={
                brief.difficulty == null
                  ? "muted"
                  : brief.difficulty <= 30
                    ? "good"
                    : brief.difficulty <= 60
                      ? "warn"
                      : "bad"
              }
            />
            <Pill
              label="KGR"
              value={brief.kgr != null ? brief.kgr.toFixed(2) : "—"}
              tooltip="Keyword Golden Ratio."
              tone={brief.kgr != null && brief.kgr < 0.25 ? "good" : "muted"}
            />
            <Pill
              label="Pos"
              value={brief.position != null ? `#${brief.position}` : "N/A"}
              tooltip="Position du site dans Google (top 100)"
              tone={positionTone(brief.position)}
            />
          </div>
        </div>
      </Link>
      <div className="flex flex-col items-end gap-[6px] shrink-0">
        <span className="text-[12px] text-[var(--text-muted)] font-mono">
          {relativeDate(brief.createdAt)}
        </span>
        <div className="flex items-center gap-[5px] flex-wrap justify-end">
          <StatusPicker status={status} onChange={onStatusChange} size="sm" />
          <TagPicker
            attached={tags}
            available={availableTags}
            onAttach={onAttach}
            onDetach={onDetach}
            onCreate={onCreate}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

function toTimestamp(value: Date | number | null): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  return value > 1e12 ? value : value * 1000;
}

type PillTone = "best" | "good" | "warn" | "bad" | "info" | "muted";

function positionTone(position: number | null): PillTone {
  if (position == null) return "muted";
  if (position <= 3) return "best";
  if (position <= 10) return "good";
  if (position <= 30) return "warn";
  return "bad";
}

function Pill({
  label,
  value,
  tooltip,
  tone,
}: {
  label: string;
  value: string;
  tooltip: string;
  tone: PillTone;
}) {
  const palette: Record<PillTone, { bg: string; color: string; border: string }> = {
    best: { bg: "var(--bg-black)", color: "var(--text-inverse)", border: "var(--bg-black)" },
    good: { bg: "var(--green-bg)", color: "var(--text)", border: "var(--green)" },
    warn: { bg: "var(--orange-bg)", color: "var(--text)", border: "var(--orange)" },
    bad: { bg: "var(--red-bg)", color: "var(--red)", border: "var(--red)" },
    info: { bg: "var(--bg-warm)", color: "var(--text-secondary)", border: "var(--border)" },
    muted: { bg: "var(--bg)", color: "var(--text-muted)", border: "var(--border)" },
  };
  const p = palette[tone];
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-[5px] px-[8px] py-[2px] rounded-full text-[11px] font-medium border"
      style={{
        background: p.bg,
        color: p.color,
        borderColor: tone === "best" ? p.border : `${p.border}40`,
      }}
    >
      <span className="text-[9px] uppercase tracking-[0.5px] opacity-75">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </span>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score);
  const r = 24;
  const length = Math.PI * r;
  const offset = length - (Math.max(0, Math.min(100, score)) / 100) * length;
  const path = `M 4 34 A ${r} ${r} 0 0 1 52 34`;
  /* Jauge = visualisation de donnees : la charte la veut sur fond noir. Le
     viewBox est cale sur la boite reelle du trace (arc de centre (28, 34) et
     de rayon 24, trait de 4,5 qui deborde de 2,25), sinon le groupe tombe bas
     dans le carre au lieu d'y etre centre. */
  return (
    <div className="w-[56px] h-[48px] bg-[var(--bg-black)] rounded-[var(--radius-sm)] flex items-center justify-center">
      <div className="relative w-[42px] h-[23px]">
        <svg viewBox="1.75 7.75 52.5 28.5" className="absolute inset-0 w-full h-full">
          <path d={path} fill="none" stroke="var(--score-track)" strokeWidth="4.5" strokeLinecap="round" />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-x-0 bottom-[1px] text-center leading-none font-mono font-semibold text-[13px] text-[var(--text-inverse)]">
          {score}
        </span>
      </div>
    </div>
  );
}
