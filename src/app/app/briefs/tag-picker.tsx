"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TAG_COLORS } from "@/lib/tags-service";

export type TagDTO = { id: string; name: string; color: string };

export function TagChip({
  tag,
  size = "md",
  onRemove,
}: {
  tag: TagDTO;
  size?: "sm" | "md";
  onRemove?: () => void;
}) {
  const sz =
    size === "sm"
      ? "text-[10px] px-[7px] py-[1px]"
      : "text-[11px] px-[8px] py-[2px]";
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-[var(--radius-pill)] font-medium border ${sz}`}
      style={{
        background: `${tag.color}1a`,
        color: tag.color,
        borderColor: `${tag.color}55`,
      }}
    >
      <span
        className="w-[6px] h-[6px] rounded-full"
        style={{ background: tag.color }}
      />
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Retirer le tag ${tag.name}`}
          className="ml-[2px] opacity-60 hover:opacity-100 cursor-pointer"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function TagList({
  tags,
  size = "md",
}: {
  tags: TagDTO[];
  size?: "sm" | "md";
}) {
  if (tags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-[5px]">
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} size={size} />
      ))}
    </span>
  );
}

/**
 * Picker complet : montre les tags du brief, permet d'attacher des tags
 * existants, créer de nouveaux tags et détacher.
 *
 * `disabledReason` non vide → l'ajout est verrouillé et la raison s'affiche
 * en tooltip. Utilisé quand le brief n'a pas de client (pas de scope possible).
 */
export function TagPicker({
  attached,
  available,
  onAttach,
  onDetach,
  onCreate,
  onDeleteTag,
  size = "md",
  buttonLabel = "+ Tag",
  disabledReason = null,
}: {
  attached: TagDTO[];
  available: TagDTO[];
  onAttach: (tagId: string) => void | Promise<void>;
  onDetach: (tagId: string) => void | Promise<void>;
  onCreate: (name: string, color: string) => Promise<TagDTO | null>;
  /** Suppression définitive d'un tag (cascade des liens). Optionnel : si
   *  absent, l'icône poubelle ne s'affiche pas (mode lecture / share). */
  onDeleteTag?: (tagId: string) => void | Promise<void>;
  size?: "sm" | "md";
  buttonLabel?: string;
  disabledReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const attachedIds = useMemo(() => new Set(attached.map((t) => t.id)), [attached]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available.filter((t) => !attachedIds.has(t.id) && (q === "" || t.name.toLowerCase().includes(q)));
  }, [available, attachedIds, query]);

  const exact = available.find((t) => t.name.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim().length > 0 && !exact;

  // Le `onCreate` du parent doit créer ET attacher le tag (et mettre à jour
  // sa propre liste locale `attached`). Sinon, après création le composant
  // parent ne saurait pas où trouver le tag fraîchement créé pour l'attacher.
  async function handleCreate() {
    if (!canCreate) return;
    const created = await onCreate(query.trim(), color);
    if (created) setQuery("");
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-[5px]" ref={ref}>
      {attached.map((t) => (
        <TagChip
          key={t.id}
          tag={t}
          size={size}
          onRemove={disabledReason ? undefined : () => void onDetach(t.id)}
        />
      ))}
      <span className="relative">
        <button
          type="button"
          disabled={!!disabledReason}
          title={disabledReason ?? undefined}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (disabledReason) return;
            setOpen((v) => !v);
          }}
          className={`inline-flex items-center gap-[4px] px-[8px] py-[2px] text-[11px] bg-[var(--bg)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius-pill)] transition-colors ${
            disabledReason
              ? "text-[var(--text-muted)] opacity-50 cursor-not-allowed"
              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)] cursor-pointer"
          }`}
        >
          {buttonLabel}
        </button>

        {open && (
          <div
            className="absolute left-0 top-full mt-1 z-40 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] py-2 w-[260px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 mb-2">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (canCreate) void handleCreate();
                  }
                }}
                placeholder="Rechercher ou créer…"
                className="w-full px-2 py-[6px] text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)]"
              />
            </div>

            <div className="max-h-[180px] overflow-y-auto">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-2 px-3 py-[6px] text-[12px] hover:bg-[var(--bg-warm)] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      void onAttach(t.id);
                      setQuery("");
                    }}
                    className="flex-1 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span
                      className="w-[8px] h-[8px] rounded-full shrink-0"
                      style={{ background: t.color }}
                    />
                    <span className="flex-1 truncate">{t.name}</span>
                  </button>
                  {onDeleteTag && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm(`Supprimer définitivement le tag « ${t.name} » ?`)) {
                          void onDeleteTag(t.id);
                        }
                      }}
                      title="Supprimer le tag"
                      aria-label={`Supprimer le tag ${t.name}`}
                      className="w-5 h-5 inline-flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-all"
                    >
                      <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M4 6h12M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2m1 0v10a1 1 0 01-1 1H7a1 1 0 01-1-1V6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {filtered.length === 0 && !canCreate && (
                <div className="px-3 py-[8px] text-[12px] text-[var(--text-muted)] italic">
                  Aucun tag disponible.
                </div>
              )}
            </div>

            {canCreate && (
              <div className="border-t border-[var(--border)] mt-1 pt-2 px-2">
                <div className="text-[10px] uppercase tracking-[0.4px] text-[var(--text-muted)] mb-1 px-1">
                  Nouveau tag
                </div>
                <div className="flex items-center gap-1 px-1 mb-2">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Couleur ${c}`}
                      className={`w-[16px] h-[16px] rounded-full border-2 transition-transform ${color === c ? "scale-110" : ""}`}
                      style={{
                        background: c,
                        borderColor: color === c ? "var(--text)" : "transparent",
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="w-full text-left px-3 py-[6px] text-[12px] hover:bg-[var(--bg-warm)] rounded-[var(--radius-xs)] transition-colors flex items-center gap-2"
                >
                  <span
                    className="w-[8px] h-[8px] rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  Créer « {query.trim()} »
                </button>
              </div>
            )}
          </div>
        )}
      </span>
    </span>
  );
}
