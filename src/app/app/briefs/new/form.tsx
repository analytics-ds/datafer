"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderSelect, type FolderOption } from "./folder-select";

const COUNTRIES = [
  { value: "fr", label: "France" },
  { value: "es", label: "Espagne" },
  { value: "us", label: "États-Unis" },
  { value: "uk", label: "Royaume-Uni" },
  { value: "de", label: "Allemagne" },
  { value: "it", label: "Italie" },
];

// L'index correspond à l'ordre d'apparition. Le mapping `analysisStep`
// reçu du backend (via /api/briefs/[id]/progress) sélectionne l'étape
// courante. Si le backend n'a encore rien dit, on reste sur 0 (le POST
// initial vient juste de partir).
const LOADING_STEPS: Array<{
  key: string;
  label: string;
  sub: string;
}> = [
  {
    key: "fetching_serp",
    label: "Récupération du top 10 Google",
    sub: "Interrogation SERP via CrazySerp",
  },
  {
    key: "crawling",
    label: "Crawl des 10 sites concurrents",
    sub: "Rendering JS via IPs résidentielles (ScrapingBee)",
  },
  {
    key: "analyzing_nlp",
    label: "Extraction du champ sémantique",
    sub: "TF-IDF + entités nommées",
  },
  {
    key: "scoring",
    label: "Calcul du score concurrentiel",
    sub: "Scoring détaillé de chaque concurrent + position SERP",
  },
  {
    key: "saving",
    label: "Préparation du brief",
    sub: "Génération de l'éditeur et écriture en base",
  },
];

function stepIndex(analysisStep: string | null): number {
  if (!analysisStep) return 0;
  // Le crawl peut envoyer "crawling:3/10", on extrait juste la clé.
  const key = analysisStep.split(":")[0];
  const i = LOADING_STEPS.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

/** Extrait le compteur "X/Y" d'un analysisStep type "crawling:3/10". */
function stepProgress(analysisStep: string | null): { done: number; total: number } | null {
  if (!analysisStep) return null;
  const m = analysisStep.match(/:(\d+)\/(\d+)$/);
  if (!m) return null;
  return { done: Number(m[1]), total: Number(m[2]) };
}

export function NewBriefForm({
  folders,
  defaultFolderId,
}: {
  folders: FolderOption[];
  defaultFolderId?: string;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("fr");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [myUrl, setMyUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setStep(0);

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const stopPolling = () => {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    try {
      // 1. POST → renvoie immédiatement l'id (l'analyse tourne en background)
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          country,
          folderId: folderId || null,
          myUrl: myUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Erreur ${res.status}`);
        setLoading(false);
        return;
      }
      const { id } = (await res.json()) as { id: string };

      // 2. Poll progress toutes les 1.5s
      const poll = async () => {
        try {
          const r = await fetch(`/api/briefs/${id}/progress`, { cache: "no-store" });
          if (r.ok) {
            const data = (await r.json()) as {
              status: "pending" | "ready" | "failed";
              analysisStep: string | null;
              errorMessage: string | null;
              redirect: string | null;
            };
            setStep(stepIndex(data.analysisStep));
            const p = stepProgress(data.analysisStep);
            setProgressLabel(p ? `${p.done}/${p.total} sites traités` : null);
            if (data.status === "ready" && data.redirect) {
              stopPolling();
              router.push(data.redirect);
              return;
            }
            if (data.status === "failed") {
              stopPolling();
              setError(data.errorMessage ?? "L'analyse a échoué");
              setLoading(false);
              return;
            }
          }
        } catch {
          // Erreur réseau passagère : on retry au prochain tick
        }
        pollTimer = setTimeout(poll, 1500);
      };
      pollTimer = setTimeout(poll, 1500);
    } catch (err) {
      stopPolling();
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] relative"
    >
      <fieldset disabled={loading} className="contents">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
          Mot-clé cible
        </label>
        <input
          type="text"
          required
          autoFocus
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Ex. chaussures de running homme"
          className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
        />

        <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
          Marché
        </label>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {COUNTRIES.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() => setCountry(c.value)}
              className={`px-3 py-[10px] rounded-[var(--radius-sm)] border-2 text-[13px] font-medium transition-colors ${
                country === c.value
                  ? "border-[var(--bg-black)] bg-[var(--bg-black)] text-[var(--text-inverse)]"
                  : "border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text)]"
              }`}
            >
              <span className="font-[family-name:var(--font-mono)] text-[11px] mr-2">
                {c.value.toUpperCase()}
              </span>
              {c.label}
            </button>
          ))}
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
          Client (optionnel)
        </label>
        <div className="mb-5">
          <FolderSelect name="folderId" folders={folders} value={folderId} onChange={setFolderId} />
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
          Mon URL existante (optionnel)
        </label>
        <input
          type="url"
          value={myUrl}
          onChange={(e) => setMyUrl(e.target.value)}
          placeholder="https://exemple.fr/page-existante"
          className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-[6px] outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
        />
        <p className="text-[11px] text-[var(--text-muted)] mb-8">
          Si tu colles une URL, on récupère le contenu pour l&apos;injecter dans l&apos;éditeur et te donner ton score initial face à la SERP.
        </p>

        {error && (
          <div className="text-[13px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/20 rounded-[var(--radius-xs)] px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !keyword.trim()}
          className="w-full bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] py-[13px] text-[14px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
        >
          {loading ? "Analyse en cours…" : "Lancer l'analyse →"}
        </button>

        <p className="text-[11px] text-[var(--text-muted)] mt-5 text-center">
          L&apos;analyse prend environ 30-45 secondes (SERP + crawl résidentiel + NLP).
        </p>
      </fieldset>

      {loading && (
        <div className="absolute inset-0 bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-[var(--radius)] flex flex-col items-center justify-center gap-5 z-10 p-6">
          <div className="w-10 h-10 border-[3px] border-[var(--border)] border-t-[var(--bg-black)] rounded-full animate-spin" />
          <div className="font-[family-name:var(--font-display)] text-[22px] tracking-[-0.3px]">
            Analyse en cours…
          </div>
          <ul className="flex flex-col gap-[10px] max-w-[340px]">
            {LOADING_STEPS.map((s, i) => {
              const state = i === step ? "current" : i < step ? "done" : "pending";
              return (
                <li
                  key={s.label}
                  className={`flex items-start gap-[10px] ${
                    state === "current"
                      ? "text-[var(--text)]"
                      : state === "done"
                        ? "text-[var(--text-secondary)]"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  <span
                    className={`w-[20px] h-[20px] rounded-full border-2 flex items-center justify-center text-[10px] shrink-0 mt-[1px] ${
                      state === "done"
                        ? "border-[var(--green)] bg-[var(--green)] text-white"
                        : state === "current"
                          ? "border-[var(--bg-black)] bg-[var(--bg-black)] text-white"
                          : "border-[var(--border)]"
                    }`}
                  >
                    {state === "done" ? "✓" : state === "current" ? (
                      <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="flex flex-col">
                    <span
                      className={`text-[13px] ${state === "current" ? "font-semibold" : ""}`}
                    >
                      {s.label}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {state === "current" && progressLabel && s.key === "crawling"
                        ? progressLabel
                        : s.sub}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </form>
  );
}
