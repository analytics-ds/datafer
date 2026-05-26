"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Suggestion = {
  url: string;
  title: string | null;
  anchor: string;
  paragraphIndex: number;
  paragraphPreview: string;
  score: number;
};

type FetchResponse = {
  suggestions?: Suggestion[];
  reason?: "ok" | "no_paragraphs" | "no_index" | "no_ai" | "no_client";
  error?: string;
};

type Props = {
  endpoint: string;
  // HTML courant de l'éditeur (passé par BriefEditor)
  getEditorHtml: () => string;
  // Appelée quand l'utilisateur clique "Insérer le lien". paragraphIndex = index
  // 0-based dans le DOM des <p>, anchor = texte exact à wrapper, url = href.
  // Renvoie true si l'insertion a réussi.
  onInsertLink?: (paragraphIndex: number, anchor: string, url: string) => boolean;
  // Désactive le bouton d'insertion (mode lecture seule côté client lecteur).
  readOnly?: boolean;
};

// Section "Maillage interne" sous l'éditeur. Fermée par défaut. À l'ouverture,
// fetch les suggestions à partir de l'HTML courant de l'éditeur. L'utilisateur
// peut rafraîchir manuellement après avoir continué à rédiger.
//
// Garantie clé : les suggestions retournées par l'API sont déjà filtrées pour
// ne jamais cibler un heading (h1/h2/h3). Côté UI on n'insère que dans le
// <p> correspondant à paragraphIndex.
export function MaillageSection({ endpoint, getEditorHtml, onInsertLink, readOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [insertedKeys, setInsertedKeys] = useState<Set<string>>(new Set());
  const fetchedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorHtml: getEditorHtml() }),
      });
      const data = (await res.json()) as FetchResponse;
      if (!res.ok) {
        setError(data.error || "Erreur lors du fetch");
        setSuggestions([]);
      } else {
        setSuggestions(data.suggestions ?? []);
        setReason(data.reason ?? "");
      }
    } catch (e) {
      setError((e as Error).message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, getEditorHtml]);

  useEffect(() => {
    if (open && !fetchedOnceRef.current) {
      fetchedOnceRef.current = true;
      void refresh();
    }
  }, [open, refresh]);

  function handleInsert(s: Suggestion) {
    const key = `${s.paragraphIndex}::${s.url}`;
    if (!onInsertLink) return;
    const ok = onInsertLink(s.paragraphIndex, s.anchor, s.url);
    if (ok) {
      setInsertedKeys((curr) => {
        const next = new Set(curr);
        next.add(key);
        return next;
      });
    }
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-card)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-3 text-left transition-colors hover:bg-[var(--bg-warm)]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
          <Chevron open={open} />
          Maillage interne
          {open && suggestions.length > 0 && (
            <span className="rounded-full bg-[var(--bg-warm)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              {suggestions.length}
            </span>
          )}
        </span>
        {open && (
          <span
            className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={(e) => {
              e.stopPropagation();
              void refresh();
            }}
            role="button"
          >
            {loading ? "Analyse…" : "Recalculer"}
          </span>
        )}
      </button>

      {open && (
        <div className="px-6 pb-5">
          {loading && suggestions.length === 0 && (
            <p className="py-2 text-[12px] text-[var(--text-muted)]">Analyse des paragraphes en cours…</p>
          )}
          {!loading && error && (
            <p className="py-2 text-[12px] text-red-600">{error}</p>
          )}
          {!loading && !error && suggestions.length === 0 && (
            <EmptyState reason={reason} />
          )}
          {suggestions.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {suggestions.map((s) => {
                const key = `${s.paragraphIndex}::${s.url}`;
                const inserted = insertedKeys.has(key);
                return (
                  <li
                    key={key}
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-[var(--text)] truncate">
                          {s.title || s.url}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">
                          {s.url}
                        </div>
                        <div className="mt-2 text-[12px] text-[var(--text-secondary)]">
                          Ancre proposée :{" "}
                          <span className="rounded bg-[var(--bg-warm)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)]">
                            {s.anchor}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] italic text-[var(--text-muted)]">
                          « {s.paragraphPreview}… »
                        </div>
                      </div>
                      {!readOnly && onInsertLink && (
                        <button
                          type="button"
                          onClick={() => handleInsert(s)}
                          disabled={inserted}
                          className={
                            inserted
                              ? "shrink-0 rounded-[var(--radius-sm)] bg-[var(--bg-warm)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)]"
                              : "shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text)] hover:bg-[var(--bg-warm)]"
                          }
                        >
                          {inserted ? "Inséré" : "Insérer"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
      aria-hidden
    >
      <path d="M3 1 L7 5 L3 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyState({ reason }: { reason: string }) {
  if (reason === "no_client") {
    return (
      <p className="py-2 text-[12px] text-[var(--text-muted)]">
        Ce brief n&apos;est rattaché à aucun client. Rattachez-le pour activer les suggestions.
      </p>
    );
  }
  if (reason === "no_index") {
    return (
      <p className="py-2 text-[12px] text-[var(--text-muted)]">
        Aucune URL indexée pour ce client. Configurez le sitemap dans les paramètres du client.
      </p>
    );
  }
  if (reason === "no_paragraphs") {
    return (
      <p className="py-2 text-[12px] text-[var(--text-muted)]">
        Aucun paragraphe rédigé pour le moment. Rédigez quelques paragraphes (30+ mots) pour obtenir des suggestions.
      </p>
    );
  }
  if (reason === "no_ai") {
    return (
      <p className="py-2 text-[12px] text-[var(--text-muted)]">
        Service IA indisponible.
      </p>
    );
  }
  return (
    <p className="py-2 text-[12px] text-[var(--text-muted)]">
      Aucune suggestion pertinente pour le moment. Continuez à rédiger puis recalculez.
    </p>
  );
}
