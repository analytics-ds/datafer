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

const LOADING_STEPS: Array<{ label: string; sub: string; durationMs: number }> = [
  {
    label: "Récupération du top 10 Google",
    sub: "Interrogation SERP via CrazySerp",
    durationMs: 4000,
  },
  {
    label: "Crawl des 10 sites concurrents",
    sub: "Rendering JS via IPs résidentielles (ScrapingBee)",
    durationMs: 25000,
  },
  {
    label: "Extraction du champ sémantique",
    sub: "TF-IDF + entités nommées",
    durationMs: 4000,
  },
  {
    label: "Calcul du score concurrentiel",
    sub: "Scoring détaillé de chaque concurrent",
    durationMs: 3000,
  },
  {
    label: "Préparation du brief",
    sub: "Sauvegarde et indexation",
    durationMs: 2000,
  },
];

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
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setStep(0);

    // Avance les étapes selon les durées estimées de chacune. C'est un
    // visuel basé sur des moyennes observées, pas un retour temps réel
    // du backend (à terme : polling sur un champ analysis_step en BDD).
    const stepTimers: ReturnType<typeof setTimeout>[] = [];
    let cumulative = 0;
    LOADING_STEPS.forEach((s, i) => {
      cumulative += s.durationMs;
      if (i < LOADING_STEPS.length - 1) {
        stepTimers.push(setTimeout(() => setStep(i + 1), cumulative));
      }
    });
    const clearTimers = () => stepTimers.forEach(clearTimeout);

    try {
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
      clearTimers();

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Erreur ${res.status}`);
        setLoading(false);
        return;
      }
      const j = (await res.json()) as { redirect: string };
      router.push(j.redirect);
    } catch (err) {
      clearTimers();
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
                    <span className="text-[11px] text-[var(--text-muted)]">{s.sub}</span>
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
