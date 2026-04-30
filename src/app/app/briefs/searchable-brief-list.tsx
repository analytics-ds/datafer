"use client";

import { useMemo, useState } from "react";
import { BriefCard, type BriefCardData, type FolderOption } from "./brief-card";
import { FilterBar, EMPTY_FILTERS, type FilterState } from "./filter-bar";
import type { TagDTO } from "./tag-picker";

export type ScopedTag = TagDTO & { clientId: string };

export function SearchableBriefList({
  briefs,
  folders,
  availableTags,
  searchPlaceholder = "Rechercher par mot-clé, client, auteur…",
}: {
  briefs: BriefCardData[];
  folders: FolderOption[];
  /** Tous les tags du workspace, scopés. Filtrés par client au moment du
   *  rendu de chaque card. */
  availableTags: ScopedTag[];
  searchPlaceholder?: string;
}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // Tags par client : on regroupe une fois pour éviter de filtrer sur chaque
  // re-render des cards.
  const tagsByClient = useMemo(() => {
    const map = new Map<string, TagDTO[]>();
    for (const t of availableTags) {
      const list = map.get(t.clientId) ?? [];
      list.push({ id: t.id, name: t.name, color: t.color });
      map.set(t.clientId, list);
    }
    return map;
  }, [availableTags]);

  // Pour la barre de filtres (transversale) on a besoin de tous les tags,
  // sans clientId.
  const flatTags = useMemo(
    () => availableTags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    [availableTags],
  );

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
        availableTags={flatTags}
        searchPlaceholder={searchPlaceholder}
      />
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
              availableTags={
                b.folder ? tagsByClient.get(b.folder.id) ?? [] : []
              }
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
  return value > 1e12 ? value : value * 1000;
}
