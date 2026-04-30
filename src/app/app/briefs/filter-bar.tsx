"use client";

import { useEffect, useRef, useState } from "react";
import {
  WORKFLOW_STATUSES,
  WORKFLOW_STATUS_LABELS,
  type WorkflowStatus,
} from "./workflow-status";
import type { TagDTO } from "./tag-picker";

export type FilterState = {
  query: string;
  statuses: WorkflowStatus[];
  tagIds: string[];
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null;
  scoreMin: number | null;
  scoreMax: number | null;
};

export const EMPTY_FILTERS: FilterState = {
  query: "",
  statuses: [],
  tagIds: [],
  dateFrom: null,
  dateTo: null,
  scoreMin: null,
  scoreMax: null,
};

export function FilterBar({
  state,
  onChange,
  availableTags,
  searchPlaceholder = "Rechercher par mot-clé, client, auteur…",
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  availableTags: TagDTO[];
  searchPlaceholder?: string;
}) {
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...state, [key]: value });

  const activeCount =
    state.statuses.length +
    state.tagIds.length +
    (state.dateFrom ? 1 : 0) +
    (state.dateTo ? 1 : 0) +
    (state.scoreMin != null ? 1 : 0) +
    (state.scoreMax != null ? 1 : 0);

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput
          value={state.query}
          onChange={(v) => update("query", v)}
          placeholder={searchPlaceholder}
        />
        <StatusFilter
          selected={state.statuses}
          onChange={(v) => update("statuses", v)}
        />
        <TagsFilter
          tags={availableTags}
          selected={state.tagIds}
          onChange={(v) => update("tagIds", v)}
        />
        <DateRangeFilter
          from={state.dateFrom}
          to={state.dateTo}
          onChange={(from, to) =>
            onChange({ ...state, dateFrom: from, dateTo: to })
          }
        />
        <ScoreRangeFilter
          min={state.scoreMin}
          max={state.scoreMax}
          onChange={(min, max) =>
            onChange({ ...state, scoreMin: min, scoreMax: max })
          }
        />
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, query: state.query })}
            className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] underline px-2"
          >
            Réinitialiser ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1 min-w-[220px]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-[9px] text-[13px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ×
        </button>
      )}
    </div>
  );
}

function FilterDropdown({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: (close: () => void) => React.ReactNode;
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-[6px] px-3 py-[9px] text-[13px] bg-[var(--bg-card)] border rounded-[var(--radius-sm)] hover:border-[var(--border-strong)] transition-colors cursor-pointer ${count > 0 ? "border-[var(--bg-black)] font-semibold" : "border-[var(--border)]"}`}
      >
        {label}
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-full text-[10px] font-semibold">
            {count}
          </span>
        )}
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
        <div
          className="absolute left-0 top-full mt-1 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] py-1 min-w-[220px]"
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function StatusFilter({
  selected,
  onChange,
}: {
  selected: WorkflowStatus[];
  onChange: (next: WorkflowStatus[]) => void;
}) {
  const toggle = (s: WorkflowStatus) =>
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);

  return (
    <FilterDropdown label="Statut" count={selected.length}>
      {() => (
        <>
          {WORKFLOW_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className="w-full flex items-center gap-2 px-3 py-[7px] text-[13px] text-left hover:bg-[var(--bg-warm)] transition-colors"
            >
              <Checkbox checked={selected.includes(s)} />
              <span>{WORKFLOW_STATUS_LABELS[s]}</span>
            </button>
          ))}
        </>
      )}
    </FilterDropdown>
  );
}

function TagsFilter({
  tags,
  selected,
  onChange,
}: {
  tags: TagDTO[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <FilterDropdown label="Tags" count={selected.length}>
      {() => (
        <div className="max-h-[260px] overflow-y-auto">
          {tags.length === 0 ? (
            <div className="px-3 py-[8px] text-[12px] text-[var(--text-muted)] italic">
              Aucun tag.
            </div>
          ) : (
            tags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className="w-full flex items-center gap-2 px-3 py-[7px] text-[13px] text-left hover:bg-[var(--bg-warm)] transition-colors"
              >
                <Checkbox checked={selected.includes(t.id)} />
                <span
                  className="w-[8px] h-[8px] rounded-full shrink-0"
                  style={{ background: t.color }}
                />
                <span className="flex-1 truncate">{t.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </FilterDropdown>
  );
}

function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const count = (from ? 1 : 0) + (to ? 1 : 0);
  return (
    <FilterDropdown label="Date" count={count}>
      {() => (
        <div className="px-3 py-2 space-y-2 w-[230px]">
          <label className="block text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">
            Du
            <input
              type="date"
              value={from ?? ""}
              onChange={(e) => onChange(e.target.value || null, to)}
              className="block w-full mt-1 px-2 py-[6px] text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)]"
            />
          </label>
          <label className="block text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">
            Au
            <input
              type="date"
              value={to ?? ""}
              onChange={(e) => onChange(from, e.target.value || null)}
              className="block w-full mt-1 px-2 py-[6px] text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)]"
            />
          </label>
          {(from || to) && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] underline"
            >
              Effacer
            </button>
          )}
        </div>
      )}
    </FilterDropdown>
  );
}

function ScoreRangeFilter({
  min,
  max,
  onChange,
}: {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const count = (min != null ? 1 : 0) + (max != null ? 1 : 0);
  const parse = (s: string): number | null => {
    if (s === "") return null;
    const n = Number(s);
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  };
  return (
    <FilterDropdown label="Score" count={count}>
      {() => (
        <div className="px-3 py-2 space-y-2 w-[230px]">
          <label className="block text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">
            Min
            <input
              type="number"
              min={0}
              max={100}
              value={min ?? ""}
              onChange={(e) => onChange(parse(e.target.value), max)}
              placeholder="0"
              className="block w-full mt-1 px-2 py-[6px] text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)]"
            />
          </label>
          <label className="block text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">
            Max
            <input
              type="number"
              min={0}
              max={100}
              value={max ?? ""}
              onChange={(e) => onChange(min, parse(e.target.value))}
              placeholder="100"
              className="block w-full mt-1 px-2 py-[6px] text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)]"
            />
          </label>
          {(min != null || max != null) && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] underline"
            >
              Effacer
            </button>
          )}
        </div>
      )}
    </FilterDropdown>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-[14px] h-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
        checked
          ? "bg-[var(--bg-black)] border-[var(--bg-black)] text-[var(--text-inverse)]"
          : "border-[var(--border-strong)]"
      }`}
    >
      {checked && (
        <svg width="9" height="9" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 11l4 4 8-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
