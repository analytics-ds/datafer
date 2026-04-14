"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NlpResult, NlpTerm, SerpResult, Paa } from "@/lib/analysis";
import { computeDetailedScore, type DetailedScore } from "@/lib/scoring";
import { faviconUrl } from "@/lib/favicon";

type Folder = { id: string; name: string; website: string | null; scope: "personal" | "agency" };

type HaloscanFlat = {
  search_volume?: number;
  cpc?: number;
  competition?: number;
  difficulty?: number;
};

type BriefEditorProps = {
  id: string;
  keyword: string;
  country: string;
  folder: Folder | null;
  initialHtml: string;
  nlp: NlpResult | null;
  serp: SerpResult[];
  paa: Paa[];
  haloscan: HaloscanFlat | { data?: HaloscanFlat } | null;
};

type Tab = "editor" | "serp" | "insights";

export function BriefEditor(props: BriefEditorProps) {
  const { id, keyword, country, folder, initialHtml, nlp, serp, paa, haloscan } = props;

  const editorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("editor");
  const [editorData, setEditorData] = useState({ text: "", h1s: [] as string[], h2s: [] as string[], h3s: [] as string[] });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Init editor content ──────────────────────────────────────────────────
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    }
    readEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Read editor state ────────────────────────────────────────────────────
  const readEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || "";
    const h1s = [...el.querySelectorAll("h1")].map((h) => (h.textContent || "").trim()).filter(Boolean);
    const h2s = [...el.querySelectorAll("h2")].map((h) => (h.textContent || "").trim()).filter(Boolean);
    const h3s = [...el.querySelectorAll("h3")].map((h) => (h.textContent || "").trim()).filter(Boolean);
    setEditorData({ text, h1s, h2s, h3s });
  }, []);

  // ─── Score ────────────────────────────────────────────────────────────────
  const score: DetailedScore = useMemo(() => computeDetailedScore(editorData, nlp), [editorData, nlp]);

  // ─── Save (debounced) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (editorData.text.length === 0 && !editorRef.current?.innerHTML) return;
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/briefs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editorHtml: editorRef.current?.innerHTML ?? "",
            score: score.total,
          }),
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("idle");
      }
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editorData, score.total, id]);

  // ─── Toolbar commands ─────────────────────────────────────────────────────
  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    readEditor();
  };

  const applyHeading = (tag: "h1" | "h2" | "h3" | "p") => {
    document.execCommand("formatBlock", false, `<${tag}>`);
    editorRef.current?.focus();
    readEditor();
  };

  const insertTermAtCursor = (term: string) => {
    editorRef.current?.focus();
    document.execCommand("insertText", false, ` ${term} `);
    readEditor();
  };

  const insertPaaAsH2 = (question: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && el) {
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    }
    document.execCommand("insertHTML", false, `<h2>${escapeHtml(question)}</h2><p><br></p>`);
    readEditor();
  };

  // ─── Derived data ─────────────────────────────────────────────────────────
  const halo = haloscan
    ? "data" in haloscan && haloscan.data
      ? haloscan.data
      : (haloscan as HaloscanFlat)
    : null;
  const crawledCount = serp.filter((s) => (s.wordCount ?? 0) > 0).length;
  const wc = editorData.text.trim().split(/\s+/).filter(Boolean).length;

  const ringCirc = 2 * Math.PI * 20;
  const ringOffset = ringCirc - (score.total / 100) * ringCirc;
  const scoreColor = score.total < 40 ? "var(--red)" : score.total < 70 ? "var(--orange)" : "var(--green)";
  const scoreHint =
    wc < 10
      ? "Commencez à écrire"
      : score.total < 25
        ? "Ajoutez du contenu"
        : score.total < 45
          ? "Enrichissez le sémantique"
          : score.total < 65
            ? "Bon début !"
            : score.total < 80
              ? "Bien optimisé"
              : "Excellent !";

  const wcTarget = nlp?.avgWordCount ?? 1200;
  const wcPct = Math.min(100, Math.round((wc / (nlp?.maxWordCount ?? wcTarget)) * 100));
  const wcBarColor =
    nlp && wc < nlp.minWordCount ? "var(--red)" : nlp && wc <= nlp.maxWordCount ? "var(--green)" : "var(--orange)";

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] min-h-[640px]">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-7 py-3 bg-[var(--bg-card)] border-b border-[var(--border)] flex-wrap">
        <div className="flex items-center gap-[10px]">
          <h2 className="font-[family-name:var(--font-display)] text-[22px] tracking-[-0.4px]">
            {keyword}
          </h2>
          <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase">
            {country}
          </span>
          {folder && (
            <Link
              href={folder.scope === "agency" ? `/app/agency/${folder.id}` : `/app/folders/${folder.id}`}
              className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text)] font-[family-name:var(--font-mono)]"
            >
              <FolderFavicon website={folder.website} size={14} />
              <span>{folder.name}</span>
            </Link>
          )}
          <span className="px-2 py-[3px] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase bg-[var(--green-bg)] text-[var(--green)]">
            {crawledCount}/{serp.length} pages crawlées
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-[11px] text-[var(--text-muted)]">Enregistrement…</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-[11px] text-[var(--green)] font-semibold">✓ Enregistré</span>
          )}
          <Link
            href="/app/briefs/new"
            className="px-4 py-[8px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[12px] font-semibold hover:bg-[var(--bg-warm)] transition-colors"
          >
            + Nouvelle analyse
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-7 bg-[var(--bg-card)] border-b border-[var(--border)]">
        <TabButton active={tab === "editor"} onClick={() => setTab("editor")}>
          Éditeur
        </TabButton>
        <TabButton active={tab === "serp"} onClick={() => setTab("serp")} count={serp.length}>
          SERP
        </TabButton>
        <TabButton active={tab === "insights"} onClick={() => setTab("insights")}>
          Insights
        </TabButton>
      </div>

      {/* Panes */}
      {tab === "editor" && (
        <div className="flex-1 grid grid-cols-[1fr_380px] overflow-hidden">
          {/* Editor main */}
          <div className="flex flex-col border-r border-[var(--border)] overflow-hidden">
            {/* Score bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
              <div className="flex items-center gap-3">
                <div className="relative w-[48px] h-[48px]">
                  <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border)" strokeWidth="4" />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={ringCirc}
                      strokeDashoffset={ringOffset}
                      style={{ transition: "stroke-dashoffset .5s ease, stroke .3s" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-mono)] font-semibold text-[14px]">
                    {score.total}
                  </div>
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[12px] font-semibold">Score SEO</span>
                  <span className="text-[11px] text-[var(--text-muted)]">{scoreHint}</span>
                </div>
              </div>
              <div className="flex items-center gap-[10px]">
                <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-secondary)]">
                  <strong className="text-[var(--text)]">{wc}</strong> mots
                </span>
                <div className="w-[90px] h-1 bg-[var(--bg-warm)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width,background] duration-300"
                    style={{ width: `${wcPct}%`, background: wcBarColor }}
                  />
                </div>
                <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-muted)]">
                  / {wcTarget}
                </span>
              </div>
            </div>

            {/* Toolbar */}
            <Toolbar exec={exec} applyHeading={applyHeading} />

            {/* Editor body */}
            <div className="flex-1 overflow-y-auto bg-[var(--bg-card)]">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={readEditor}
                className="rich-editor min-h-full px-8 py-7 outline-none text-[16px] leading-[1.85]"
                data-placeholder="Commencez à rédiger votre contenu optimisé ici…"
              />
            </div>
          </div>

          {/* Sidebar */}
          <EditorSidebar
            score={score}
            nlp={nlp}
            paa={paa}
            editorText={editorData.text}
            editorH1Count={editorData.h1s.length}
            editorH1HasKw={editorData.h1s.some((h) => nlp ? h.toLowerCase().includes(nlp.exactKeyword.keyword) : false)}
            insertTermAtCursor={insertTermAtCursor}
            insertPaaAsH2={insertPaaAsH2}
          />
        </div>
      )}

      {tab === "serp" && (
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <div className="grid gap-2 max-w-[880px]">
            {serp.map((r) => (
              <a
                key={r.position}
                href={r.link}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-[44px_1fr_auto] gap-4 items-center bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-3 hover:border-[var(--border-strong)] transition-colors"
              >
                <span
                  className={`w-10 h-10 flex items-center justify-center font-[family-name:var(--font-mono)] font-semibold text-[14px] rounded-[var(--radius-xs)] ${
                    r.position <= 3
                      ? "bg-[var(--bg-olive-light)] text-[var(--accent-dark)]"
                      : "bg-[var(--bg-warm)] text-[var(--text-secondary)]"
                  }`}
                >
                  {r.position}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-[13px] truncate">{r.title}</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate">
                    {r.displayed_link}
                  </div>
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold">
                      {r.wordCount ? r.wordCount : "—"}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
                      mots
                    </div>
                  </div>
                  <div>
                    <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold">
                      {r.headings ?? "—"}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
                      titres
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {tab === "insights" && (
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <InsightsPane nlp={nlp} halo={halo} serp={serp} paa={paa} />
        </div>
      )}

      <style jsx global>{`
        .rich-editor:empty::before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          pointer-events: none;
        }
        .rich-editor h1 {
          font-family: var(--font-display), Georgia, serif;
          font-size: 32px;
          font-weight: 400;
          line-height: 1.2;
          letter-spacing: -0.8px;
          margin: 24px 0 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid var(--bg-olive-light);
        }
        .rich-editor h2 {
          font-size: 22px;
          font-weight: 700;
          line-height: 1.3;
          margin: 20px 0 8px;
        }
        .rich-editor h3 {
          font-size: 17px;
          font-weight: 600;
          line-height: 1.4;
          margin: 16px 0 6px;
          color: var(--text-secondary);
        }
        .rich-editor p {
          margin-bottom: 12px;
        }
        .rich-editor ul,
        .rich-editor ol {
          margin: 8px 0 12px 24px;
        }
        .rich-editor li {
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}

// ─── Toolbar ────────────────────────────────────────────────────────────────
function Toolbar({
  exec,
  applyHeading,
}: {
  exec: (cmd: string, v?: string) => void;
  applyHeading: (tag: "h1" | "h2" | "h3" | "p") => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="flex items-center gap-[2px] px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)] flex-wrap">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="tb-btn"
          title="Titres"
        >
          <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold">¶</span>
        </button>
        {menuOpen && (
          <div className="absolute top-9 left-0 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] z-30 min-w-[200px] p-[6px]">
            <HeadingOption
              onClick={() => {
                applyHeading("h1");
                setMenuOpen(false);
              }}
              label="H1"
              desc="Titre principal"
              size="text-[20px] font-bold"
            />
            <HeadingOption
              onClick={() => {
                applyHeading("h2");
                setMenuOpen(false);
              }}
              label="H2"
              desc="Sous-titre"
              size="text-[16px] font-semibold"
            />
            <HeadingOption
              onClick={() => {
                applyHeading("h3");
                setMenuOpen(false);
              }}
              label="H3"
              desc="Section"
              size="text-[14px] font-semibold"
            />
            <HeadingOption
              onClick={() => {
                applyHeading("p");
                setMenuOpen(false);
              }}
              label="¶"
              desc="Paragraphe"
              size="text-[14px] text-[var(--text-secondary)]"
            />
          </div>
        )}
      </div>
      <div className="w-px h-6 bg-[var(--border)] mx-[6px]" />
      <button onClick={() => exec("bold")} className="tb-btn" title="Gras (Ctrl+B)">
        <b>B</b>
      </button>
      <button onClick={() => exec("italic")} className="tb-btn" title="Italique (Ctrl+I)">
        <i>I</i>
      </button>
      <button onClick={() => exec("underline")} className="tb-btn" title="Souligné (Ctrl+U)">
        <u>U</u>
      </button>
      <div className="w-px h-6 bg-[var(--border)] mx-[6px]" />
      <button onClick={() => exec("insertUnorderedList")} className="tb-btn" title="Liste à puces">
        •≡
      </button>
      <button onClick={() => exec("insertOrderedList")} className="tb-btn" title="Liste numérotée">
        1≡
      </button>
      <div className="w-px h-6 bg-[var(--border)] mx-[6px]" />
      <button onClick={() => exec("removeFormat")} className="tb-btn text-[11px]" title="Supprimer le formatage">
        ✕
      </button>

      <style jsx>{`
        .tb-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 700;
          transition: all 0.2s;
        }
        .tb-btn:hover {
          background: var(--bg-card);
          color: var(--text);
        }
      `}</style>
    </div>
  );
}

function HeadingOption({
  onClick,
  label,
  desc,
  size,
}: {
  onClick: () => void;
  label: string;
  desc: string;
  size: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md hover:bg-[var(--bg-warm)] transition-colors ${size}`}
    >
      <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-[var(--text-muted)] mr-2">
        {label}
      </span>
      {desc}
    </button>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────
function EditorSidebar({
  score,
  nlp,
  paa,
  editorText,
  editorH1Count,
  editorH1HasKw,
  insertTermAtCursor,
  insertPaaAsH2,
}: {
  score: DetailedScore;
  nlp: NlpResult | null;
  paa: Paa[];
  editorText: string;
  editorH1Count: number;
  editorH1HasKw: boolean;
  insertTermAtCursor: (t: string) => void;
  insertPaaAsH2: (q: string) => void;
}) {
  const lower = editorText.toLowerCase();
  const wc = editorText.trim().split(/\s+/).filter(Boolean).length;

  const subItems = [
    {
      label: "Mot-clé exact",
      s: score.keyword,
      color: "var(--accent)",
      tip: score.keyword.score < 10 ? "↑ Ajoutez des occurrences naturelles du mot-clé" : "✓ Bonne densité de mot-clé",
    },
    {
      label: "Couverture NLP",
      s: score.nlpCoverage,
      color: "var(--purple)",
      tip:
        Number(score.nlpCoverage.details.coverage ?? 0) < 50
          ? `↑ Utilisez les termes sémantiques (${score.nlpCoverage.details.used}/${score.nlpCoverage.details.total} couverts)`
          : "✓ Bon champ sémantique",
    },
    {
      label: "Longueur",
      s: score.contentLength,
      color: "var(--green)",
      tip:
        wc < (nlp?.minWordCount ?? 500)
          ? `↑ Visez au moins ${nlp?.minWordCount} mots`
          : "✓ Longueur dans la cible",
    },
    {
      label: "Titres H1/H2/H3",
      s: score.headings,
      color: "#E85D3A",
      tip:
        score.headings.score < 10
          ? Number(score.headings.details.h1 ?? 0) === 0
            ? "↑ Ajoutez un H1 avec votre mot-clé"
            : Number(score.headings.details.h1 ?? 0) > 1
              ? "⚠ Un seul H1 recommandé"
              : "↑ Ajoutez des H2 pour structurer"
          : "✓ Bonne hiérarchie de titres",
    },
    {
      label: "Placement KW",
      s: score.placement,
      color: "var(--blue)",
      tip: score.placement.score < 10 ? "↑ Placez le mot-clé dans l'intro et répartissez-le" : "✓ Mot-clé bien distribué",
    },
    {
      label: "Structure",
      s: score.structure,
      color: "var(--orange)",
      tip: score.structure.score < 6 ? "↑ Découpez en paragraphes plus courts" : "✓ Bonne structure",
    },
    {
      label: "Qualité rédac.",
      s: score.quality,
      color: "var(--text-secondary)",
      tip: score.quality.score < 6 ? "↑ Variez le vocabulaire et la longueur des phrases" : "✓ Bonne qualité rédactionnelle",
    },
  ];

  // Tiered NLP
  const essential: NlpTerm[] = [];
  const important: NlpTerm[] = [];
  const opportunity: NlpTerm[] = [];
  (nlp?.nlpTerms ?? []).slice(0, 40).forEach((k) => {
    if (k.presence >= 70) essential.push(k);
    else if (k.presence >= 40) important.push(k);
    else opportunity.push(k);
  });

  const ek = nlp?.exactKeyword;
  let kwCount = 0;
  let density = 0;
  let inIntro = false;
  if (ek) {
    const rx = new RegExp(ek.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    kwCount = (lower.match(rx) ?? []).length;
    density =
      wc > 0 ? Math.round(((kwCount * ek.keyword.split(/\s+/).length) / wc) * 10000) / 100 : 0;
    inIntro = editorText.trim().split(/\s+/).slice(0, 100).join(" ").toLowerCase().includes(ek.keyword);
  }

  return (
    <aside className="flex flex-col overflow-y-auto bg-[var(--bg)] p-5 text-[13px]">
      {/* Score détaillé */}
      <Section title="Score détaillé" dotColor="var(--bg-black)">
        {subItems.map((i) => {
          const pct = Math.round((i.s.score / i.s.max) * 100);
          const valColor = pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--orange)" : "var(--red)";
          return (
            <div key={i.label} className="mb-[10px]">
              <div className="flex justify-between items-center mb-[3px]">
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">{i.label}</span>
                <span
                  className="font-[family-name:var(--font-mono)] text-[11px] font-semibold"
                  style={{ color: valColor }}
                >
                  {i.s.score}/{i.s.max}
                </span>
              </div>
              <div className="h-1 bg-[var(--bg-warm)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-400"
                  style={{ width: `${pct}%`, background: i.color }}
                />
              </div>
              {pct < 100 && (
                <div className="text-[10px] text-[var(--text-muted)] mt-[3px] italic leading-[1.3]">{i.tip}</div>
              )}
            </div>
          );
        })}
      </Section>

      {/* Mot-clé exact */}
      {ek && (
        <Section title="Mot-clé exact" dotColor="var(--accent)">
          <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold px-3 py-[7px] bg-[var(--bg-warm)] rounded-[var(--radius-xs)] mb-[10px] text-center">
            &quot;{ek.keyword}&quot;
          </div>
          <Metric
            label="Occurrences"
            value={`${kwCount} / ~${ek.avgCount}`}
            tone={kwCount >= ek.avgCount * 0.7 ? "good" : "warn"}
          />
          <Metric
            label="Densité"
            value={`${density}% / ${ek.idealDensityMin.toFixed(1)}–${ek.idealDensityMax.toFixed(1)}%`}
            tone={
              density >= ek.idealDensityMin && density <= ek.idealDensityMax
                ? "good"
                : density > ek.idealDensityMax
                  ? "bad"
                  : "warn"
            }
          />
          <Metric label="Dans l'intro" value={inIntro ? "✓" : "✗"} tone={inIntro ? "good" : "warn"} />
          <Metric
            label="Dans le H1"
            value={`${editorH1HasKw ? "✓" : "✗"} (${ek.inH1Pct}% SERP)`}
            tone={editorH1HasKw ? "good" : "warn"}
          />
          <Metric
            label="Nb de H1"
            value={`${editorH1Count} / 1`}
            tone={editorH1Count === 1 ? "good" : editorH1Count === 0 ? "warn" : "bad"}
            last
          />
        </Section>
      )}

      {/* People Also Ask */}
      {paa.length > 0 && (
        <Section title="People Also Ask" dotColor="var(--blue)">
          <div className="flex flex-col gap-1">
            {paa.slice(0, 6).map((q, i) => (
              <button
                key={i}
                onClick={() => insertPaaAsH2(q.question)}
                title="Cliquer pour insérer comme H2"
                className="group flex items-start gap-2 px-[10px] py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-xs)] text-left text-[12px] leading-[1.4] hover:border-[var(--accent)] hover:bg-[var(--bg-olive-light)] transition-colors"
              >
                <span className="text-[var(--text-muted)] text-[11px] mt-[1px]">?</span>
                <span className="flex-1">{q.question}</span>
                <span className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.5px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  → H2
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Champ sémantique NLP */}
      {nlp && (essential.length || important.length || opportunity.length) > 0 && (
        <Section title="Champ sémantique NLP" dotColor="var(--purple)">
          <TierTags label="Essentiels" color="var(--red)" bg="#FFF0F0" border="#E8BCBC" terms={essential} lower={lower} onInsert={insertTermAtCursor} />
          <TierTags label="Importants" color="var(--orange)" bg="var(--orange-bg)" border="#E8D6A0" terms={important} lower={lower} onInsert={insertTermAtCursor} />
          <TierTags label="Opportunité" color="var(--blue)" bg="var(--blue-bg)" border="#B8D0E8" terms={opportunity} lower={lower} onInsert={insertTermAtCursor} />
        </Section>
      )}

      {/* Benchmarks SERP */}
      {nlp && (
        <Section title="Benchmarks SERP" dotColor="var(--green)">
          <BenchRow label="Plage de mots" value={`${nlp.minWordCount} — ${nlp.maxWordCount}`} />
          <BenchRow label="Moyenne" value={String(nlp.avgWordCount)} />
          <BenchRow label="Titres" value={String(nlp.avgHeadings)} />
          <BenchRow label="Paragraphes" value={String(nlp.avgParagraphs)} last />
        </Section>
      )}

      {/* Structure conseillée */}
      {nlp && (
        <Section title="Structure conseillée" dotColor="var(--orange)">
          <StructCard>
            <strong>H1 :</strong> 1 seul H1, avec le mot-clé. {nlp.exactKeyword.inH1Pct}% des concurrents le font.
          </StructCard>
          <StructCard>
            <strong>H2 :</strong> ~{Math.max(2, Math.round(nlp.avgHeadings * 0.6))} sous-titres H2.
          </StructCard>
          <StructCard>
            <strong>Longueur :</strong> {nlp.minWordCount}–{nlp.maxWordCount} mots.
          </StructCard>
        </Section>
      )}
    </aside>
  );
}

// ─── Sidebar atoms ──────────────────────────────────────────────────────────
function Section({ title, dotColor, children }: { title: string; dotColor: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-[6px] text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-[10px]">
        <span className="w-[6px] h-[6px] rounded-full" style={{ background: dotColor }} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  last,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
  last?: boolean;
}) {
  const toneColor = tone === "good" ? "var(--green)" : tone === "bad" ? "var(--red)" : tone === "warn" ? "var(--orange)" : "var(--text)";
  return (
    <div
      className={`flex justify-between items-center py-[5px] text-[11px] ${
        last ? "" : "border-b border-[var(--border)]"
      }`}
    >
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-[family-name:var(--font-mono)] font-semibold" style={{ color: toneColor }}>
        {value}
      </span>
    </div>
  );
}

function TierTags({
  label,
  color,
  bg,
  border,
  terms,
  lower,
  onInsert,
}: {
  label: string;
  color: string;
  bg: string;
  border: string;
  terms: NlpTerm[];
  lower: string;
  onInsert: (t: string) => void;
}) {
  if (!terms.length) return null;
  const used = terms.filter((k) => lower.includes(k.term)).length;
  return (
    <div className="mb-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.8px] mb-[6px] flex items-center gap-[5px]" style={{ color }}>
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
        {label}
        <span className="font-[family-name:var(--font-mono)] font-normal text-[var(--text-muted)]">
          {used}/{terms.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-[5px]">
        {terms.map((k) => {
          const isUsed = lower.includes(k.term);
          return (
            <button
              key={k.term}
              onClick={() => onInsert(k.term)}
              title="Cliquer pour insérer"
              className="inline-flex items-center gap-1 px-[10px] py-[4px] rounded-full text-[11px] font-medium border hover:scale-[1.03] transition-transform"
              style={
                isUsed
                  ? { background: "var(--green-bg)", borderColor: "var(--green)", color: "var(--green)" }
                  : { background: bg, borderColor: border, color }
              }
            >
              {k.term}
              <span
                className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80"
              >
                {k.presence}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BenchRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex justify-between py-[7px] text-[12px] ${
        last ? "" : "border-b border-[var(--border)]"
      }`}
    >
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-[family-name:var(--font-mono)] font-semibold">{value}</span>
    </div>
  );
}

function StructCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-[14px] py-3 mb-[7px] text-[12px] leading-[1.5] text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 bg-transparent border-none border-b-2 text-[13px] transition-all ${
        active
          ? "text-[var(--text)] font-semibold border-[var(--bg-black)]"
          : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]"
      }`}
    >
      {children}
      {count !== undefined && (
        <span
          className={`ml-[5px] inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-full text-[10px] font-[family-name:var(--font-mono)] font-semibold ${
            active ? "bg-[var(--bg-black)] text-[var(--text-inverse)]" : "bg-[var(--bg-warm)] text-[var(--text-muted)]"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Insights pane ──────────────────────────────────────────────────────────
function InsightsPane({
  nlp,
  halo,
  serp,
  paa,
}: {
  nlp: NlpResult | null;
  halo: HaloscanFlat | null;
  serp: SerpResult[];
  paa: Paa[];
}) {
  const vp = serp.filter((r) => (r.wordCount ?? 0) > 0);
  const aW = vp.length ? Math.round(vp.reduce((s, r) => s + (r.wordCount ?? 0), 0) / vp.length) : 0;
  const tk = (nlp?.nlpTerms ?? []).slice(0, 12);
  const ms = tk.length ? tk[0].score : 1;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 max-w-[1100px]">
      <InsightCard title="Données mot-clé" dotColor="var(--accent)">
        {halo ? (
          <>
            {halo.search_volume != null && <InsightMetric label="Volume" value={halo.search_volume.toLocaleString("fr-FR")} />}
            {halo.cpc != null && <InsightMetric label="CPC" value={`${halo.cpc} €`} />}
            {halo.competition != null && <InsightMetric label="Compétition" value={String(halo.competition)} />}
            {halo.difficulty != null && <InsightMetric label="Difficulté" value={`${halo.difficulty}/100`} />}
          </>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">Haloscan non disponible.</p>
        )}
      </InsightCard>

      {paa.length > 0 && (
        <InsightCard title="People Also Ask" dotColor="var(--blue)">
          {paa.slice(0, 8).map((q, i) => (
            <div key={i} className="py-2 border-b border-[var(--border)] last:border-0">
              <span className="text-[12px]">{q.question}</span>
            </div>
          ))}
        </InsightCard>
      )}

      <InsightCard title="Stats SERP" dotColor="var(--green)">
        <InsightMetric label="Pages crawlées" value={`${vp.length}/${serp.length}`} />
        <InsightMetric label="Mots moyen" value={aW.toLocaleString("fr-FR")} />
      </InsightCard>

      {tk.length > 0 && (
        <div className="col-span-full bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5">
          <div className="flex items-center gap-[7px] text-[13px] font-semibold mb-4">
            <span className="w-[7px] h-[7px] rounded-full bg-[var(--purple)]" />
            Top NLP
          </div>
          <div className="flex flex-col gap-[5px]">
            {tk.map((k) => (
              <div key={k.term} className="flex items-center justify-between px-[10px] py-[7px] bg-[var(--bg)] rounded-[var(--radius-xs)] text-[12px]">
                <span className="font-medium">{k.term}</span>
                <div className="flex-1 max-w-[80px] h-[3px] bg-[var(--border)] rounded-full mx-[10px] overflow-hidden">
                  <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${Math.round((k.score / ms) * 100)}%` }} />
                </div>
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-muted)]">{k.presence}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({ title, dotColor, children }: { title: string; dotColor: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5">
      <div className="flex items-center gap-[7px] text-[13px] font-semibold mb-4">
        <span className="w-[7px] h-[7px] rounded-full" style={{ background: dotColor }} />
        {title}
      </div>
      {children}
    </div>
  );
}

function InsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
      <span className="font-[family-name:var(--font-mono)] font-semibold text-[14px]">{value}</span>
    </div>
  );
}

// ─── Utils ──────────────────────────────────────────────────────────────────
function FolderFavicon({ website, size }: { website: string | null; size: number }) {
  const src = faviconUrl(website, Math.max(size * 2, 32));
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-[3px] shrink-0"
      loading="lazy"
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
