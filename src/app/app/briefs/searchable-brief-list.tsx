"use client";

import { useMemo, useState } from "react";
import { BriefCard, type BriefCardData, type FolderOption } from "./brief-card";
import { FilterBar, EMPTY_FILTERS, type FilterState } from "./filter-bar";
import type { TagDTO } from "./tag-picker";

export function SearchableBriefList({
  briefs,
  folders,
  availableTags,
}: {
  briefs: BriefCardData[];
  folders: FolderOption[];
  availableTags: TagDTO[];
}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const fromTs = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
    // dateTo inclus jusqu'à la fin de la journée locale.
    const toTs = filters.dateTo
      ? new Date(filters.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;

    return briefs.filter((b) => {
      if (q) {
        const hit =
          b.keyword.toLowerCase().includes(q) ||
          (b.folder?.name?.toLowerCase().includes(q) ?? false) ||
          (b.folder?.website?.toLowerCase().includes(q) ?? false) ||
          (b.author?.name?.toLowerCase().includes(q) ?? false) ||
          b.tags.some((t) => t.name.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (filters.statuses.length > 0 && !filters.statuses.includes(b.workflowStatus))
        return false;
      if (filters.tagIds.length > 0) {
        const briefTagIds = new Set(b.tags.map((t) => t.id));
        const allMatch = filters.tagIds.every((id) => briefTagIds.has(id));
        if (!allMatch) return false;
      }
      const ts = toTimestamp(b.createdAt);
      if (fromTs != null && (ts == null || ts < fromTs)) return false;
      if (toTs != null && (ts == null || ts > toTs)) return false;
      return true;
    });
  }, [briefs, filters]);

  return (
    <>
      <FilterBar state={filters} onChange={setFilters} availableTags={availableTags} />
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[var(--text-muted)]">
          Aucun brief ne correspond aux filtres.
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((b) => (
            <BriefCard
              key={b.id}
              brief={b}
              folders={folders}
              availableTags={availableTags}
            />
          ))}
        </div>
      )}
    </>
  );
}

function toTimestamp(value: Date | number | null): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  // Drizzle renvoie parfois un nombre en secondes (unixepoch) ou ms selon le mode.
  return value > 1e12 ? value : value * 1000;
}
