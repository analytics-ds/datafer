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

const MAX_BATCH = 5;

const LOADING_STEPS: Array<{ key: string; label: string; sub: string }> = [
  { key: "fetching_serp", label: "Récupération du top 10 Google", sub: "Interrogation SERP via CrazySerp" },
  { key: "crawling", label: "Crawl des 10 sites concurrents", sub: "Rendering JS via IPs résidentielles (Bright Data Web Unlocker)" },
  { key: "analyzing_nlp", label: "Extraction du champ sémantique", sub: "TF-IDF + entités nommées" },
  { key: "scoring", label: "Calcul du score concurrentiel", sub: "Scoring détaillé de chaque concurrent + position SERP" },
  { key: "saving", label: "Préparation du brief", sub: "Génération de l'éditeur et écriture en base" },
];

function stepIndex(analysisStep: string | null): number {
  if (!analysisStep) return 0;
  const key = analysisStep.split(":")[0];
  const i = LOADING_STEPS.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

function stepProgress(analysisStep: string | null): { done: number; total: number } | null {
  if (!analysisStep) return null;
  const m = analysisStep.match(/:(\d+)\/(\d+)$/);
  if (!m) return null;
  return { done: Number(m[1]), total: Number(m[2]) };
}

type Mode = "simple" | "bulk";
type BriefInput = { keyword: string; country: string; folderId: string; myUrl: string };

function emptyRow(defaultFolderId?: string, isHead = false): BriefInput {
  // Le 1er row porte les valeurs par défaut explicites (FR + folder courant).
  // Les rows suivants démarrent vides : ils héritent visuellement et au submit
  // du 1er row tant que l'utilisateur ne les surcharge pas.
  return {
    keyword: "",
    country: isHead ? "fr" : "",
    folderId: isHead ? defaultFolderId ?? "" : "",
    myUrl: "",
  };
}

/** En mode bulk, fusionner un row avec les valeurs du 1er row pour combler les champs vides. */
function resolveBulkRow(row: BriefInput, head: BriefInput): BriefInput {
  return {
    keyword: row.keyword,
    country: row.country || head.country || "fr",
    folderId: row.folderId || head.folderId || "",
    myUrl: row.myUrl,
  };
}

export function NewBriefForm({
  folders,
  defaultFolderId,
}: {
  folders: FolderOption[];
  defaultFolderId?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("simple");

  const [single, setSingle] = useState<BriefInput>(() => emptyRow(defaultFolderId, true));
  const [rows, setRows] = useState<BriefInput[]>(() =>
    Array.from({ length: MAX_BATCH }, (_, i) => emptyRow(defaultFolderId, i === 0)),
  );

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validRows = rows.filter((r) => r.keyword.trim().length > 0);

  function patchSingle(p: Partial<BriefInput>) {
    setSingle((prev) => ({ ...prev, ...p }));
  }
  function patchRow(i: number, p: Partial<BriefInput>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  async function postOne(input: BriefInput): Promise<{ id: string } | { error: string }> {
    const res = await fetch("/api/briefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: input.keyword.trim(),
        country: input.country,
        folderId: input.folderId || null,
        myUrl: input.myUrl.trim() || null,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: j.error ?? `Erreur ${res.status}` };
    }
    return (await res.json()) as { id: string };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setStep(0);

    if (mode === "bulk") {
      if (validRows.length === 0) {
        setError("Renseigne au moins un mot-clé");
        setLoading(false);
        return;
      }
      // Le 1er row valide sert de fallback pour pays/client des suivants
      // qui n'ont pas été surchargés (UX "remplir le 1er = tout définir").
      const head = validRows[0];
      const resolved = validRows.map((r) => resolveBulkRow(r, head));
      const results = await Promise.all(resolved.map(postOne));
      const failed = results.filter((r): r is { error: string } => "error" in r);
      if (failed.length === results.length) {
        setError(`Aucun brief n'a été créé : ${failed[0].error}`);
        setLoading(false);
        return;
      }
      // Si tous les briefs vont vers le même client, on redirige vers ce dossier.
      // Sinon, vers la liste globale (les briefs apparaissent en haut, status pending).
      const folderIds = new Set(resolved.map((r) => r.folderId).filter(Boolean));
      const target =
        folderIds.size === 1 ? `/app/folders/${[...folderIds][0]}` : "/app/briefs";
      router.push(target);
      return;
    }

    // Mode simple : POST + polling de progression
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const stopPolling = () => {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    try {
      const created = await postOne(single);
      if ("error" in created) {
        setError(created.error);
        setLoading(false);
        return;
      }
      const id = created.id;
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
          // retry au prochain tick
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

  const submitDisabled =
    loading ||
    (mode === "simple" ? single.keyword.trim().length === 0 : validRows.length === 0);

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] relative"
    >
      <fieldset disabled={loading} className="contents">
        <ModeToggle mode={mode} onChange={setMode} bulkCount={validRows.length} />

        {mode === "simple" ? (
          <SimpleSection
            input={single}
            patch={patchSingle}
            folders={folders}
          />
        ) : (
          <BulkSection rows={rows} patch={patchRow} folders={folders} />
        )}

        {error && (
          <div className="text-[13px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/20 rounded-[var(--radius-xs)] px-3 py-2 mb-4 mt-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] py-[13px] text-[14px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
        >
          {loading
            ? mode === "bulk"
              ? `Création de ${validRows.length} briefs…`
              : "Analyse en cours…"
            : mode === "bulk"
              ? `Lancer ${validRows.length || ""} ${validRows.length > 1 ? "analyses" : "analyse"} →`
              : "Lancer l'analyse →"}
        </button>

        <p className="text-[11px] text-[var(--text-muted)] mt-5 text-center">
          {mode === "bulk"
            ? "Les briefs sont enfilés dans la queue d'analyse (~60-90s par brief, séquentiel)."
            : "L'analyse prend environ 30-45 secondes (SERP + crawl résidentiel + NLP)."}
        </p>
      </fieldset>

      {loading && (
        <div className="absolute inset-0 bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-[var(--radius)] flex flex-col items-center justify-center gap-5 z-10 p-6">
          <div className="w-10 h-10 border-[3px] border-[var(--border)] border-t-[var(--bg-black)] rounded-full animate-spin" />
          {mode === "bulk" ? (
            <>
              <div className="font-[family-name:var(--font-display)] text-[22px] tracking-[-0.3px]">
                Création de {validRows.length} briefs…
              </div>
              <p className="text-[13px] text-[var(--text-muted)] max-w-[340px] text-center">
                Tu vas être redirigé vers la liste pour suivre la progression individuelle de chaque brief.
              </p>
            </>
          ) : (
            <>
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
                        <span className={`text-[13px] ${state === "current" ? "font-semibold" : ""}`}>
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
            </>
          )}
        </div>
      )}
    </form>
  );
}

function ModeToggle({
  mode,
  onChange,
  bulkCount,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  bulkCount: number;
}) {
  return (
    <div className="flex gap-1 p-[3px] bg-[var(--bg-warm)] rounded-[var(--radius-sm)] mb-6 w-fit">
      {(
        [
          { value: "simple", label: "1 brief" },
          { value: "bulk", label: `Batch (jusqu'à ${MAX_BATCH})` },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-[6px] text-[12px] font-medium rounded-[var(--radius-xs)] transition-colors ${
            mode === opt.value
              ? "bg-[var(--bg-card)] text-[var(--text)] shadow-[var(--shadow-xs)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {opt.label}
          {opt.value === "bulk" && bulkCount > 0 && mode !== "bulk" && (
            <span className="ml-2 text-[10px] text-[var(--text-muted)]">{bulkCount} prêt{bulkCount > 1 ? "s" : ""}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function SimpleSection({
  input,
  patch,
  folders,
}: {
  input: BriefInput;
  patch: (p: Partial<BriefInput>) => void;
  folders: FolderOption[];
}) {
  return (
    <>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Mot-clé cible
      </label>
      <input
        type="text"
        required
        autoFocus
        value={input.keyword}
        onChange={(e) => patch({ keyword: e.target.value })}
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
            onClick={() => patch({ country: c.value })}
            className={`px-3 py-[10px] rounded-[var(--radius-sm)] border-2 text-[13px] font-medium transition-colors ${
              input.country === c.value
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
        <FolderSelect
          name="folderId"
          folders={folders}
          value={input.folderId}
          onChange={(v) => patch({ folderId: v })}
        />
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Mon URL existante (optionnel)
      </label>
      <input
        type="url"
        value={input.myUrl}
        onChange={(e) => patch({ myUrl: e.target.value })}
        placeholder="https://exemple.fr/page-existante"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-[6px] outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
      />
      <p className="text-[11px] text-[var(--text-muted)] mb-8">
        Si tu colles une URL, on récupère le contenu pour l&apos;injecter dans l&apos;éditeur et te donner ton score initial face à la SERP.
      </p>
    </>
  );
}

function BulkSection({
  rows,
  patch,
  folders,
}: {
  rows: BriefInput[];
  patch: (i: number, p: Partial<BriefInput>) => void;
  folders: FolderOption[];
}) {
  const head = rows[0];
  return (
    <div className="flex flex-col gap-3 mb-5">
      <div className="flex items-baseline justify-between">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)]">
          Briefs à lancer
        </label>
        <span className="text-[11px] text-[var(--text-muted)]">
          Le pays/client du Brief 1 sert de défaut pour les suivants.
        </span>
      </div>
      {rows.map((row, i) => (
        <BulkRow
          key={i}
          index={i}
          row={row}
          head={head}
          patch={(p) => patch(i, p)}
          folders={folders}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

function BulkRow({
  index,
  row,
  head,
  patch,
  folders,
  autoFocus,
}: {
  index: number;
  row: BriefInput;
  head: BriefInput;
  patch: (p: Partial<BriefInput>) => void;
  folders: FolderOption[];
  autoFocus?: boolean;
}) {
  const isActive = row.keyword.trim().length > 0;
  const isHead = index === 0;
  // Pour les rows non-head, si le champ est vide, on affiche ce qui sera hérité
  // du Brief 1 sous forme de placeholder explicite ("↑ FR", "↑ Celio").
  const headFolderName =
    !isHead && head.folderId
      ? folders.find((f) => f.id === head.folderId)?.name ?? null
      : null;
  const inheritedCountryLabel = !isHead && !row.country ? `↑ ${(head.country || "fr").toUpperCase()}` : null;
  const inheritedFolderLabel = !isHead && !row.folderId ? `↑ ${headFolderName ?? "Aucun"} (Brief 1)` : null;

  return (
    <div
      className={`border-2 rounded-[var(--radius-sm)] p-3 transition-colors ${
        isActive
          ? "border-[var(--border-strong)] bg-[var(--bg-card)]"
          : "border-[var(--border)] bg-[var(--bg-card)] opacity-90 hover:opacity-100"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
            isActive
              ? "bg-[var(--bg-black)] text-[var(--text-inverse)]"
              : "bg-[var(--bg-warm)] text-[var(--text-muted)]"
          }`}
        >
          {index + 1}
        </span>
        <input
          type="text"
          autoFocus={autoFocus}
          value={row.keyword}
          onChange={(e) => patch({ keyword: e.target.value })}
          placeholder={`Mot-clé ${index + 1}${isHead ? " (obligatoire)" : ""}`}
          className="flex-1 px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
        />
      </div>
      <div className="grid grid-cols-[1fr_110px_200px] gap-2 pl-[30px]">
        <input
          type="url"
          value={row.myUrl}
          onChange={(e) => patch({ myUrl: e.target.value })}
          placeholder="URL existante (optionnel)"
          className="px-3 py-[7px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)] transition-colors text-[12px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
        />
        <select
          value={row.country}
          onChange={(e) => patch({ country: e.target.value })}
          className={`px-2 py-[7px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none focus:border-[var(--bg-black)] transition-colors text-[12px] bg-[var(--bg-card)] font-[family-name:var(--font-mono)] ${
            !row.country && !isHead ? "text-[var(--text-muted)] italic" : ""
          }`}
        >
          {!isHead && (
            <option value="">{inheritedCountryLabel ?? `↑ ${(head.country || "fr").toUpperCase()}`}</option>
          )}
          {COUNTRIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value.toUpperCase()}
            </option>
          ))}
        </select>
        <FolderSelect
          name={`folderId-${index}`}
          folders={folders}
          value={row.folderId}
          onChange={(v) => patch({ folderId: v })}
          emptyLabel={isHead ? "Aucun client" : inheritedFolderLabel ?? "Aucun client"}
          emptyPlaceholder={isHead ? "Aucun client" : inheritedFolderLabel ?? "Aucun client"}
        />
      </div>
    </div>
  );
}
