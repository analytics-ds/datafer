"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { BriefOverrides } from "@/lib/brief-overrides";
import type { NlpTerm, SerpResult } from "@/lib/analysis";
import { faviconUrl } from "@/lib/favicon";

type Props = {
  briefId: string;
  open: boolean;
  onClose: () => void;
  /** Position effective actuelle (raw ou override) — pour pré-remplir l'input. */
  currentPosition: number | null;
  /** Word count benchmarks bruts (avant overrides) — pour l'astuce "valeurs SERP". */
  rawAvgWordCount: number;
  rawMinWordCount: number;
  rawMaxWordCount: number;
  /** SERP brute complète pour permettre de cocher/décocher chaque concurrent. */
  rawSerp: SerpResult[];
  /** Termes NLP bruts complets pour permettre d'en cacher. */
  rawNlpTerms: NlpTerm[];
  /** Overrides actuels persistés en BDD. */
  current: BriefOverrides;
};

export function BriefSettingsModal({
  briefId,
  open,
  onClose,
  currentPosition,
  rawAvgWordCount,
  rawMinWordCount,
  rawMaxWordCount,
  rawSerp,
  rawNlpTerms,
  current,
}: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // État local édité dans la modal. Initialisé sur les overrides actuels :
  // si la valeur est absente, on tombe sur la raw value (passée en placeholder
  // pour signifier la valeur d'origine).
  const [positionInput, setPositionInput] = useState<string>(
    currentPosition != null ? String(currentPosition) : "",
  );
  const [minWc, setMinWc] = useState<string>(
    current.wordCount?.min != null ? String(current.wordCount.min) : "",
  );
  const [maxWc, setMaxWc] = useState<string>(
    current.wordCount?.max != null ? String(current.wordCount.max) : "",
  );
  const [avgWc, setAvgWc] = useState<string>(
    current.wordCount?.avg != null ? String(current.wordCount.avg) : "",
  );
  const [disabledSet, setDisabledSet] = useState<Set<string>>(
    () => new Set(current.disabledCompetitors ?? []),
  );
  const [removedTerms, setRemovedTerms] = useState<Set<string>>(
    () => new Set(current.nlpTermsRemoved ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset l'état local quand la modal s'ouvre (au cas où les props ont
  // changé entre 2 ouvertures).
  useEffect(() => {
    if (!open) return;
    setPositionInput(currentPosition != null ? String(currentPosition) : "");
    setMinWc(current.wordCount?.min != null ? String(current.wordCount.min) : "");
    setMaxWc(current.wordCount?.max != null ? String(current.wordCount.max) : "");
    setAvgWc(current.wordCount?.avg != null ? String(current.wordCount.avg) : "");
    setDisabledSet(new Set(current.disabledCompetitors ?? []));
    setRemovedTerms(new Set(current.nlpTermsRemoved ?? []));
    setError(null);
  }, [open, currentPosition, current]);

  const top40Terms = useMemo(() => rawNlpTerms.slice(0, 40), [rawNlpTerms]);

  function toggleCompetitor(url: string) {
    setDisabledSet((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleTerm(term: string) {
    setRemovedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  }

  function parseIntOrUndef(s: string): number | undefined {
    if (s.trim() === "") return undefined;
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  async function save() {
    setSaving(true);
    setError(null);

    const body: BriefOverrides = {};

    // Position : "" → null (reset au raw), sinon entier ≥ 1.
    if (positionInput.trim() === "") {
      body.position = null;
    } else {
      const p = parseInt(positionInput, 10);
      if (!Number.isFinite(p) || p < 1) {
        setError("La position doit être un entier ≥ 1");
        setSaving(false);
        return;
      }
      body.position = p;
    }

    // Word count : trois champs indépendants. Tous vides → undefined (reset).
    const min = parseIntOrUndef(minWc);
    const max = parseIntOrUndef(maxWc);
    const avg = parseIntOrUndef(avgWc);
    if (min !== undefined || max !== undefined || avg !== undefined) {
      body.wordCount = {};
      if (min !== undefined) body.wordCount.min = min;
      if (max !== undefined) body.wordCount.max = max;
      if (avg !== undefined) body.wordCount.avg = avg;
    } else {
      body.wordCount = undefined;
    }

    body.disabledCompetitors = Array.from(disabledSet);
    body.nlpTermsRemoved = Array.from(removedTerms);

    const r = await fetch(`/api/briefs/${briefId}/overrides`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Erreur enregistrement");
      setSaving(false);
      return;
    }

    setSaving(false);
    onClose();
    // Refresh route pour re-fetch la data avec les overrides appliqués
    // côté serveur (page.tsx).
    router.refresh();
  }

  if (!mounted || !open) return null;

  const node = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] w-full max-w-[640px] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-[15px] font-semibold leading-none">Paramètres du brief</h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Back-office uniquement. Le client ne voit pas cet écran sur le partage.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-[20px] leading-none px-2"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 flex flex-col gap-6">
          {/* Position */}
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)] mb-2">
              Position SERP
              <InfoBubble text="Position du domaine du client dans Google (top 100). Override la valeur récupérée automatiquement via Haloscan/CrazySerp. Vider le champ pour revenir à la position d'origine." />
            </h3>
            <input
              type="number"
              min={1}
              max={100}
              value={positionInput}
              onChange={(e) => setPositionInput(e.target.value)}
              placeholder="auto"
              className="w-32 px-3 py-2 text-[13px] border border-[var(--border)] rounded-[var(--radius-xs)] bg-[var(--bg)] focus:outline-none focus:border-[var(--accent)]"
            />
            <span className="ml-2 text-[11px] text-[var(--text-muted)]">
              vide = position détectée automatiquement
            </span>
          </section>

          {/* Word count */}
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)] mb-2">
              Nombre de mots de référence
              <InfoBubble text={`Sert au scoring du critère "Longueur" et à l'affichage du benchmark concurrents. Valeurs auto issues du crawl du top 10 : ${rawMinWordCount} à ${rawMaxWordCount} mots, moyenne ${rawAvgWordCount}.`} />
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <WcInput label="Min" value={minWc} onChange={setMinWc} placeholder={String(rawMinWordCount)} />
              <WcInput label="Avg" value={avgWc} onChange={setAvgWc} placeholder={String(rawAvgWordCount)} />
              <WcInput label="Max" value={maxWc} onChange={setMaxWc} placeholder={String(rawMaxWordCount)} />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              Vide = valeur d&apos;origine du crawl. Recalcule le score &quot;Longueur&quot; à l&apos;enregistrement.
            </p>
          </section>

          {/* Concurrents */}
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)] mb-2">
              Concurrents top {rawSerp.length}
              <InfoBubble text="Décocher un concurrent le retire des calculs (médiane des scores, benchmarks word count) et de l'affichage SERP. Le centroïde sémantique paragraphe reste figé sur le top 10 d'origine." />
            </h3>
            <div className="flex flex-col gap-1 border border-[var(--border)] rounded-[var(--radius-xs)] divide-y divide-[var(--border)]">
              {rawSerp.map((r, i) => {
                const isDisabled = disabledSet.has(r.link);
                let host = r.link;
                try {
                  host = new URL(r.link).hostname.replace(/^www\./, "");
                } catch {
                  // garde l'URL brute
                }
                return (
                  <label
                    key={r.link}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--bg-warm)]"
                  >
                    <input
                      type="checkbox"
                      checked={!isDisabled}
                      onChange={() => toggleCompetitor(r.link)}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                    <span className="text-[var(--text-muted)] font-[family-name:var(--font-mono)] text-[11px] w-5 shrink-0">
                      #{i + 1}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={faviconUrl(r.link, 16) ?? ""}
                      alt=""
                      width={16}
                      height={16}
                      className="rounded-[2px] shrink-0"
                    />
                    <span
                      className={`text-[13px] truncate ${isDisabled ? "line-through text-[var(--text-muted)]" : ""}`}
                      title={r.link}
                    >
                      {host}
                    </span>
                    <span className="ml-auto text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] shrink-0">
                      {r.wordCount ?? 0} mots
                    </span>
                  </label>
                );
              })}
              {rawSerp.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-[var(--text-muted)] italic">
                  Aucun concurrent dans le SERP.
                </div>
              )}
            </div>
          </section>

          {/* Termes NLP */}
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)] mb-2">
              Termes NLP à masquer
              <InfoBubble text="Sur les 40 termes top, décocher pour retirer un terme du brief (chips dans l'éditeur, scoring couverture NLP). Utile pour cacher du bruit (cookie, newsletter, footer…) qui n'a rien à voir avec le sujet du KW." />
            </h3>
            <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto p-2 border border-[var(--border)] rounded-[var(--radius-xs)]">
              {top40Terms.map((t) => {
                const removed = removedTerms.has(t.term);
                return (
                  <button
                    key={t.term}
                    onClick={() => toggleTerm(t.term)}
                    className={`text-[11px] px-2 py-1 rounded-[var(--radius-pill)] border transition-colors ${
                      removed
                        ? "bg-[var(--bg-warm)] border-[var(--border)] text-[var(--text-muted)] line-through"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
                    }`}
                    title={`Présent chez ${t.presence}% des concurrents (avg ${t.avgCount})`}
                  >
                    {t.term}
                    <span className="ml-1.5 text-[9px] opacity-60">{t.presence}%</span>
                  </button>
                );
              })}
              {top40Terms.length === 0 && (
                <span className="text-[12px] text-[var(--text-muted)] italic px-2 py-1">
                  Aucun terme NLP analysé.
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              Clic = masquer / réafficher. Recalcule la couverture NLP à l&apos;enregistrement.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--border)]">
          {error ? (
            <span className="text-[12px] text-[var(--red)] font-medium">{error}</span>
          ) : (
            <span className="text-[11px] text-[var(--text-muted)]">
              Les modifs sont visibles aussi sur le partage client.
            </span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-[13px] border border-[var(--border)] rounded-[var(--radius-xs)] hover:bg-[var(--bg-warm)] disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-[13px] font-semibold bg-[var(--accent)] text-[var(--text-inverse)] rounded-[var(--radius-xs)] hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function WcInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 text-[13px] border border-[var(--border)] rounded-[var(--radius-xs)] bg-[var(--bg)] focus:outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}

/**
 * Petite bulle "i" qui affiche un tooltip natif au hover. Utilisée dans les
 * titres de section pour expliquer les paramètres au consultant.
 */
function InfoBubble({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--border-strong)] text-[10px] font-bold text-[var(--text-muted)] cursor-help align-middle"
    >
      i
    </span>
  );
}
