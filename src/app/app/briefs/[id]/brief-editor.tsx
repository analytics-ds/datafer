"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NlpResult, NlpTerm, SerpResult, Paa, HaloscanOverview } from "@/lib/analysis";
import { computeDetailedScore, type DetailedScore } from "@/lib/scoring";
import { faviconUrl } from "@/lib/favicon";
import { EditorToolbar } from "./toolbar";
import { ShareBriefPanel } from "../share-brief-panel";

type Folder = { id: string; name: string; website: string | null; scope: "personal" | "agency" };

type BriefEditorProps = {
  id: string;
  keyword: string;
  country: string;
  folder: Folder | null;
  initialHtml: string;
  nlp: NlpResult | null;
  serp: SerpResult[];
  paa: Paa[];
  haloscan: HaloscanOverview | null;
  /**
   * Endpoint PATCH utilisé pour la sauvegarde débouncée du contenu.
   * - `/api/briefs/<id>` pour les users authentifiés
   * - `/api/share/<token>/briefs/<id>` pour les accès publics via partage
   */
  saveEndpoint?: string;
  /** Masquer le bouton "Nouvelle analyse" (ex. en mode partage). */
  hideNewAnalysis?: boolean;
  /** Token de partage déjà actif sur le brief (mode consultant uniquement). */
  shareToken?: string | null;
};

type Tab = "editor" | "serp" | "insights";

export function BriefEditor(props: BriefEditorProps) {
  const { id, keyword, country, folder, initialHtml, nlp, serp, paa, haloscan } = props;
  const saveEndpoint = props.saveEndpoint ?? `/api/briefs/${id}`;
  const hideNewAnalysis = props.hideNewAnalysis ?? false;

  const editorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("editor");
  const [editorData, setEditorData] = useState({ text: "", h1s: [] as string[], h2s: [] as string[], h3s: [] as string[] });
  const [currentTag, setCurrentTag] = useState<"h1" | "h2" | "h3" | "p" | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    }
    readEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || "";
    const h1s = [...el.querySelectorAll("h1")].map((h) => (h.textContent || "").trim()).filter(Boolean);
    const h2s = [...el.querySelectorAll("h2")].map((h) => (h.textContent || "").trim()).filter(Boolean);
    const h3s = [...el.querySelectorAll("h3")].map((h) => (h.textContent || "").trim()).filter(Boolean);
    setEditorData({ text, h1s, h2s, h3s });
    updateCurrentTag();
  }, []);

  const updateCurrentTag = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node: Node | null = sel.anchorNode;
    while (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    let tag: string | null = null;
    while (node && node !== editorRef.current) {
      const name = (node as Element).nodeName?.toLowerCase();
      if (["h1", "h2", "h3", "p"].includes(name)) {
        tag = name;
        break;
      }
      node = node.parentNode;
    }
    setCurrentTag(tag as "h1" | "h2" | "h3" | "p" | null);
  }, []);

  const score: DetailedScore = useMemo(() => computeDetailedScore(editorData, nlp), [editorData, nlp]);

  // Debounced save
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (editorData.text.length === 0 && !editorRef.current?.innerHTML) return;
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(saveEndpoint, {
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
  }, [editorData, score.total, saveEndpoint]);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    readEditor();
  };

  const applyHeading = (tag: "h1" | "h2" | "h3" | "p") => {
    editorRef.current?.focus();
    document.execCommand("formatBlock", false, `<${tag}>`);
    readEditor();
  };

  const handleHighlight = (color: string) => {
    editorRef.current?.focus();
    if (!color) {
      document.execCommand("hiliteColor", false, "transparent");
    } else {
      document.execCommand("hiliteColor", false, color);
    }
    readEditor();
  };

  const handleInsertImage = () => {
    const url = window.prompt("URL de l'image :");
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("insertImage", false, url);
    readEditor();
  };

  const handleInsertLink = () => {
    const url = window.prompt("URL du lien :");
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    readEditor();
  };

  const handleInsertTable = () => {
    const dims = window.prompt("Dimensions du tableau (lignes x colonnes), ex : 3x4", "3x3");
    if (!dims) return;
    const m = dims.match(/^(\d+)\s*[x×]\s*(\d+)$/);
    if (!m) return;
    const rows = Math.min(20, Math.max(1, Number(m[1])));
    const cols = Math.min(10, Math.max(1, Number(m[2])));
    const rowCells = (cells: string) =>
      `<tr>${Array.from({ length: cols }).map(() => cells).join("")}</tr>`;
    const html =
      `<table><thead>${rowCells("<th><br></th>")}</thead><tbody>${Array.from({ length: rows - 1 })
        .map(() => rowCells("<td><br></td>"))
        .join("")}</tbody></table><p><br></p>`;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
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

  const halo = haloscan;
  const crawledCount = serp.filter((s) => (s.wordCount ?? 0) > 0).length;
  const wc = editorData.text.trim().split(/\s+/).filter(Boolean).length;

  const wcTarget = nlp?.avgWordCount ?? 1200;
  const wcPct = Math.min(100, Math.round((wc / (nlp?.maxWordCount ?? wcTarget)) * 100));
  const wcBarColor =
    nlp && wc < nlp.minWordCount ? "var(--red)" : nlp && wc <= nlp.maxWordCount ? "var(--green)" : "var(--orange)";

  return (
    <div className="flex flex-col h-[calc(100vh)] min-h-[640px]">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-7 py-3 bg-[var(--bg-card)] border-b border-[var(--border)] flex-wrap">
        <div className="flex items-center gap-[10px]">
          <h2 className="font-[family-name:var(--font-display)] text-[22px] tracking-[-0.4px]">
            {keyword}
          </h2>
          <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase">
            {country}
          </span>
          {folder && !hideNewAnalysis && (
            <Link
              href={`/app/folders/${folder.id}`}
              className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text)] font-[family-name:var(--font-mono)]"
            >
              <FolderFavicon website={folder.website} size={14} />
              <span>{folder.name}</span>
            </Link>
          )}
          {folder && hideNewAnalysis && (
            <span className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)]">
              <FolderFavicon website={folder.website} size={14} />
              <span>{folder.name}</span>
            </span>
          )}
          <span className="px-2 py-[3px] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase bg-[var(--green-bg)] text-[var(--green)]">
            {crawledCount}/{serp.length} pages crawlées
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && <span className="text-[11px] text-[var(--text-muted)]">Enregistrement…</span>}
          {saveStatus === "saved" && <span className="text-[11px] text-[var(--green)] font-semibold">✓ Enregistré</span>}
          {!hideNewAnalysis && (
            <ShareBriefPanel briefId={id} initialToken={props.shareToken ?? null} />
          )}
          {!hideNewAnalysis && (
            <Link
              href="/app/briefs/new"
              className="px-4 py-[8px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[12px] font-semibold hover:bg-[var(--bg-warm)] transition-colors"
            >
              + Nouvelle analyse
            </Link>
          )}
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

      <div className={tab === "editor" ? "flex-1 grid grid-cols-[1fr_380px] overflow-hidden" : "hidden"}>
          {/* Editor main */}
          <div className="flex flex-col border-r border-[var(--border)] overflow-hidden">
            {/* Word count bar */}
            <div className="flex items-center justify-end px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-card)] gap-[10px]">
              <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-secondary)]">
                <strong className="text-[var(--text)]">{wc}</strong> mots
              </span>
              <div className="w-[120px] h-1 bg-[var(--bg-warm)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width,background] duration-300"
                  style={{ width: `${wcPct}%`, background: wcBarColor }}
                />
              </div>
              <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-muted)]">
                / {wcTarget}
              </span>
            </div>

            {/* Rich toolbar */}
            <EditorToolbar
              currentTag={currentTag}
              onExec={exec}
              onApplyHeading={applyHeading}
              onInsertImage={handleInsertImage}
              onInsertTable={handleInsertTable}
              onInsertLink={handleInsertLink}
              onHighlight={handleHighlight}
            />

            {/* Editor */}
            <div className="flex-1 overflow-y-auto bg-[var(--bg-card)]">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={readEditor}
                onKeyUp={updateCurrentTag}
                onMouseUp={updateCurrentTag}
                className="rich-editor min-h-full px-8 py-7 outline-none text-[16px] leading-[1.85]"
                data-placeholder="Commencez à rédiger votre contenu optimisé ici…"
              />
            </div>
          </div>

          {/* Sidebar */}
          <EditorSidebar
            scoreTotal={score.total}
            wc={wc}
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

      <div className={tab === "serp" ? "flex-1 overflow-y-auto px-7 py-6" : "hidden"}>
        <div className="grid gap-2 max-w-[880px]">
          {serp.map((r) => (
            <SerpCard key={r.position} r={r} />
          ))}
        </div>
      </div>

      <div className={tab === "insights" ? "flex-1 overflow-y-auto px-7 py-6" : "hidden"}>
        <InsightsPane nlp={nlp} halo={halo} serp={serp} paa={paa} />
      </div>

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
        .rich-editor p { margin-bottom: 12px; }
        .rich-editor ul, .rich-editor ol { margin: 8px 0 12px 24px; }
        .rich-editor li { margin-bottom: 4px; }
        .rich-editor img {
          max-width: 100%;
          height: auto;
          border-radius: var(--radius-sm);
          margin: 12px 0;
        }
        .rich-editor a { color: var(--accent-dark); text-decoration: underline; }
        .rich-editor table {
          width: 100%;
          border-collapse: collapse;
          margin: 14px 0;
          font-size: 14px;
        }
        .rich-editor table th,
        .rich-editor table td {
          border: 1px solid var(--border);
          padding: 8px 12px;
          text-align: left;
          min-width: 60px;
          min-height: 24px;
        }
        .rich-editor table th {
          background: var(--bg-warm);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function EditorSidebar({
  scoreTotal,
  wc,
  score,
  nlp,
  paa,
  editorText,
  editorH1Count,
  editorH1HasKw,
  insertTermAtCursor,
  insertPaaAsH2,
}: {
  scoreTotal: number;
  wc: number;
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

  const subItems = [
    { label: "Mot-clé exact", s: score.keyword, color: "var(--accent)",
      tip: score.keyword.score < 10 ? "↑ Ajoutez des occurrences naturelles du mot-clé" : "✓ Bonne densité de mot-clé" },
    { label: "Couverture NLP", s: score.nlpCoverage, color: "var(--purple)",
      tip: Number(score.nlpCoverage.details.coverage ?? 0) < 50
        ? `↑ Utilisez les termes sémantiques (${score.nlpCoverage.details.used}/${score.nlpCoverage.details.total} couverts)`
        : "✓ Bon champ sémantique" },
    { label: "Longueur", s: score.contentLength, color: "var(--green)",
      tip: wc < (nlp?.minWordCount ?? 500) ? `↑ Visez au moins ${nlp?.minWordCount} mots` : "✓ Longueur dans la cible" },
    { label: "Titres H1/H2/H3", s: score.headings, color: "#E85D3A",
      tip: score.headings.score < 10
        ? Number(score.headings.details.h1 ?? 0) === 0 ? "↑ Ajoutez un H1 avec votre mot-clé"
        : Number(score.headings.details.h1 ?? 0) > 1 ? "⚠ Un seul H1 recommandé"
        : "↑ Ajoutez des H2 pour structurer"
        : "✓ Bonne hiérarchie de titres" },
    { label: "Placement KW", s: score.placement, color: "var(--blue)",
      tip: score.placement.score < 10 ? "↑ Placez le mot-clé dans l'intro et répartissez-le" : "✓ Mot-clé bien distribué" },
    { label: "Structure", s: score.structure, color: "var(--orange)",
      tip: score.structure.score < 6 ? "↑ Découpez en paragraphes plus courts" : "✓ Bonne structure" },
    { label: "Qualité rédac.", s: score.quality, color: "var(--text-secondary)",
      tip: score.quality.score < 6 ? "↑ Variez le vocabulaire et la longueur des phrases" : "✓ Bonne qualité rédactionnelle" },
  ];

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
    density = wc > 0 ? Math.round(((kwCount * ek.keyword.split(/\s+/).length) / wc) * 10000) / 100 : 0;
    inIntro = editorText.trim().split(/\s+/).slice(0, 100).join(" ").toLowerCase().includes(ek.keyword);
  }

  const ringCirc = 2 * Math.PI * 44;
  const ringOffset = ringCirc - (scoreTotal / 100) * ringCirc;
  const scoreColor = scoreTotal < 40 ? "var(--red)" : scoreTotal < 70 ? "var(--orange)" : "var(--green)";
  const scoreHint =
    wc < 10 ? "Commencez à écrire"
    : scoreTotal < 25 ? "Ajoutez du contenu"
    : scoreTotal < 45 ? "Enrichissez le sémantique"
    : scoreTotal < 65 ? "Bon début !"
    : scoreTotal < 80 ? "Bien optimisé"
    : "Excellent !";

  return (
    <aside className="flex flex-col overflow-y-auto bg-[var(--bg)] p-5 text-[13px]">
      {/* Big score ring */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5 mb-5 flex items-center gap-4">
        <div className="relative w-[100px] h-[100px] shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke={scoreColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={ringOffset}
              style={{ transition: "stroke-dashoffset .5s ease, stroke .3s" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-[family-name:var(--font-display)] text-[36px] leading-none">{scoreTotal}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] mt-[2px]">/ 100</span>
          </div>
        </div>
        <div className="flex flex-col gap-[4px] min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">Score SEO</span>
          <span className="text-[13px] font-semibold leading-tight">{scoreHint}</span>
        </div>
      </div>

      {/* Sub-scores */}
      <Section title="Score détaillé" dotColor="var(--bg-black)" collapsible defaultOpen={false}>
        {subItems.map((i) => {
          const pct = Math.round((i.s.score / i.s.max) * 100);
          const valColor = pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--orange)" : "var(--red)";
          return (
            <div key={i.label} className="mb-[10px]">
              <div className="flex justify-between items-center mb-[3px]">
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">{i.label}</span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] font-semibold" style={{ color: valColor }}>
                  {i.s.score}/{i.s.max}
                </span>
              </div>
              <div className="h-1 bg-[var(--bg-warm)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-[width] duration-400" style={{ width: `${pct}%`, background: i.color }} />
              </div>
              {pct < 100 && (
                <div className="text-[10px] text-[var(--text-muted)] mt-[3px] italic leading-[1.3]">{i.tip}</div>
              )}
            </div>
          );
        })}
      </Section>

      {ek && (
        <Section title="Mot-clé exact" dotColor="var(--accent)" collapsible defaultOpen={false}>
          <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold px-3 py-[7px] bg-[var(--bg-warm)] rounded-[var(--radius-xs)] mb-[10px] text-center">
            &quot;{ek.keyword}&quot;
          </div>
          <Metric label="Occurrences" value={`${kwCount} / ~${ek.avgCount}`} tone={kwCount >= ek.avgCount * 0.7 ? "good" : "warn"} />
          <Metric label="Densité" value={`${density}% / ${ek.idealDensityMin.toFixed(1)}–${ek.idealDensityMax.toFixed(1)}%`}
            tone={density >= ek.idealDensityMin && density <= ek.idealDensityMax ? "good" : density > ek.idealDensityMax ? "bad" : "warn"} />
          <Metric label="Dans l'intro" value={inIntro ? "✓" : "✗"} tone={inIntro ? "good" : "warn"} />
          <Metric label="Dans le H1" value={`${editorH1HasKw ? "✓" : "✗"} (${ek.inH1Pct}% SERP)`} tone={editorH1HasKw ? "good" : "warn"} />
          <Metric label="Nb de H1" value={`${editorH1Count} / 1`} tone={editorH1Count === 1 ? "good" : editorH1Count === 0 ? "warn" : "bad"} last />
        </Section>
      )}

      {nlp && (essential.length || important.length || opportunity.length) > 0 && (
        <Section title="Champ sémantique NLP" dotColor="var(--purple)">
          <TierTags label="Essentiels" color="var(--red)" bg="#FFF0F0" border="#E8BCBC" terms={essential} lower={lower} onInsert={insertTermAtCursor} />
          <TierTags label="Importants" color="var(--orange)" bg="var(--orange-bg)" border="#E8D6A0" terms={important} lower={lower} onInsert={insertTermAtCursor} />
          <TierTags label="Opportunité" color="var(--blue)" bg="var(--blue-bg)" border="#B8D0E8" terms={opportunity} lower={lower} onInsert={insertTermAtCursor} />
        </Section>
      )}

      {paa.length > 0 && (
        <Section title="People Also Ask" dotColor="var(--blue)" collapsible defaultOpen={false}>
          <div className="flex flex-col gap-1">
            {paa.slice(0, 8).map((q, i) => (
              <button
                key={i}
                onClick={() => insertPaaAsH2(q.question)}
                title="Cliquer pour insérer comme H2"
                className="group flex items-start gap-2 px-[10px] py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-xs)] text-left text-[12px] leading-[1.4] hover:border-[var(--accent)] hover:bg-[var(--bg-olive-light)] transition-colors"
              >
                <span className="text-[var(--text-muted)] text-[11px] mt-[1px]">?</span>
                <span className="flex-1">{q.question}</span>
                <span className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.5px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→ H2</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {nlp && (
        <Section title="Benchmarks SERP" dotColor="var(--green)" collapsible defaultOpen={false}>
          <BenchRow label="Plage de mots" value={`${nlp.minWordCount} — ${nlp.maxWordCount}`} />
          <BenchRow label="Moyenne" value={String(nlp.avgWordCount)} />
          <BenchRow label="Titres" value={String(nlp.avgHeadings)} />
          <BenchRow label="Paragraphes" value={String(nlp.avgParagraphs)} last />
        </Section>
      )}

      {nlp && (
        <Section title="Structure conseillée" dotColor="var(--orange)" collapsible defaultOpen={false}>
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

function Section({
  title,
  dotColor,
  defaultOpen = true,
  collapsible = false,
  children,
}: {
  title: string;
  dotColor: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
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

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-[6px] text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-[10px] hover:text-[var(--text)] transition-colors"
      >
        <span className="flex items-center gap-[6px]">
          <span className="w-[6px] h-[6px] rounded-full" style={{ background: dotColor }} />
          {title}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 20 20"
          fill="none"
          className="transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}

function Metric({ label, value, tone, last }: { label: string; value: string; tone?: "good" | "warn" | "bad"; last?: boolean }) {
  const toneColor = tone === "good" ? "var(--green)" : tone === "bad" ? "var(--red)" : tone === "warn" ? "var(--orange)" : "var(--text)";
  return (
    <div className={`flex justify-between items-center py-[5px] text-[11px] ${last ? "" : "border-b border-[var(--border)]"}`}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-[family-name:var(--font-mono)] font-semibold" style={{ color: toneColor }}>{value}</span>
    </div>
  );
}

function TierTags({ label, color, bg, border, terms, lower, onInsert }: {
  label: string; color: string; bg: string; border: string; terms: NlpTerm[]; lower: string; onInsert: (t: string) => void;
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
          // Compte des occurrences actuelles dans l'éditeur
          const rx = new RegExp(
            `\\b${k.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "gi",
          );
          const currentCount = (lower.match(rx) ?? []).length;
          const hasRange = typeof k.minCount === "number" && k.maxCount > 0;
          const rangeLabel = hasRange
            ? k.minCount === k.maxCount
              ? String(k.maxCount)
              : `${k.minCount}-${k.maxCount}`
            : null;

          // Couleur : vert si dans la fourchette, orange si au-dessus, défaut du tier sinon
          let styleMode: "in-range" | "over" | "default" = "default";
          if (hasRange && currentCount >= k.minCount && currentCount <= k.maxCount) {
            styleMode = "in-range";
          } else if (hasRange && currentCount > k.maxCount) {
            styleMode = "over";
          }

          const style =
            styleMode === "in-range"
              ? { background: "var(--green-bg)", borderColor: "var(--green)", color: "var(--green)" }
              : styleMode === "over"
                ? { background: "var(--orange-bg)", borderColor: "var(--orange)", color: "var(--orange)" }
                : { background: bg, borderColor: border, color };

          return (
            <button
              key={k.term}
              onClick={() => onInsert(k.term)}
              title={
                hasRange
                  ? `Visez ${rangeLabel} occurrences (moyenne ${k.avgCount}). Actuel : ${currentCount}.`
                  : "Cliquer pour insérer"
              }
              className="inline-flex items-center gap-[5px] px-[10px] py-[4px] rounded-full text-[11px] font-medium border hover:scale-[1.03] transition-transform"
              style={style}
            >
              {k.term}
              {rangeLabel && (
                <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
                  {currentCount > 0 ? `${currentCount}/${rangeLabel}` : rangeLabel}
                </span>
              )}
              {!rangeLabel && currentCount > 0 && (
                <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
                  {currentCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BenchRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between py-[7px] text-[12px] ${last ? "" : "border-b border-[var(--border)]"}`}>
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

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
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

function InsightsPane({ nlp, halo, serp, paa }: { nlp: NlpResult | null; halo: HaloscanOverview | null; serp: SerpResult[]; paa: Paa[] }) {
  const vp = serp.filter((r) => (r.wordCount ?? 0) > 0);
  const aW = vp.length ? Math.round(vp.reduce((s, r) => s + (r.wordCount ?? 0), 0) / vp.length) : 0;
  const tk = (nlp?.nlpTerms ?? []).slice(0, 12);
  const ms = tk.length ? tk[0].score : 1;

  const haloHasData = halo && (halo.search_volume != null || halo.cpc != null || halo.competition != null || halo.difficulty != null || halo.resultCount != null);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 max-w-[1100px]">
      <InsightCard title="Données mot-clé" dotColor="var(--accent)">
        {haloHasData ? (
          <>
            {halo?.search_volume != null && <InsightMetric label="Volume" value={halo.search_volume.toLocaleString("fr-FR")} />}
            {halo?.cpc != null && <InsightMetric label="CPC" value={`${halo.cpc} €`} />}
            {halo?.competition != null && <InsightMetric label="Compétition" value={String(halo.competition)} />}
            {halo?.difficulty != null && <InsightMetric label="Difficulté" value={`${halo.difficulty}/100`} />}
            {halo?.resultCount != null && <InsightMetric label="Résultats Google" value={halo.resultCount.toLocaleString("fr-FR")} />}
          </>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">
            Métriques volume/CPC/difficulté non disponibles sur ce plan Haloscan.
          </p>
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

function FolderFavicon({ website, size }: { website: string | null; size: number }) {
  const src = faviconUrl(website, Math.max(size * 2, 32));
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className="rounded-[3px] shrink-0" loading="lazy" />;
}

function SerpCard({ r }: { r: SerpResult }) {
  const [open, setOpen] = useState(false);
  const hasStructure = (r.h1?.length ?? 0) + (r.h2?.length ?? 0) + (r.h3?.length ?? 0) > 0;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] hover:border-[var(--border-strong)] transition-colors">
      <div className="grid grid-cols-[44px_1fr_auto] gap-4 items-center px-4 py-3">
        <a
          href={r.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-10 h-10 flex items-center justify-center font-[family-name:var(--font-mono)] font-semibold text-[14px] rounded-[var(--radius-xs)] ${
            r.position <= 3
              ? "bg-[var(--bg-olive-light)] text-[var(--accent-dark)]"
              : "bg-[var(--bg-warm)] text-[var(--text-secondary)]"
          }`}
          aria-label={`Ouvrir le résultat ${r.position}`}
        >
          {r.position}
        </a>
        <a
          href={r.link}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 hover:underline"
        >
          <div className="font-semibold text-[13px] truncate">{r.title}</div>
          <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate">
            {r.displayed_link}
          </div>
        </a>
        <div className="flex items-center gap-4 text-center">
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
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={!hasStructure}
            className="px-3 py-[6px] rounded-[var(--radius-xs)] text-[11px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {open ? "▲ Structure" : "▼ Structure"}
          </button>
        </div>
      </div>

      {open && hasStructure && (
        <div className="border-t border-[var(--border)] px-5 py-4 bg-[var(--bg)]">
          {(r.h1 ?? []).map((h, i) => (
            <HeadingLine key={`h1-${i}`} level="h1" text={h} />
          ))}
          {(r.h2 ?? []).map((h, i) => (
            <HeadingLine key={`h2-${i}`} level="h2" text={h} />
          ))}
          {(r.h3 ?? []).map((h, i) => (
            <HeadingLine key={`h3-${i}`} level="h3" text={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeadingLine({ level, text }: { level: "h1" | "h2" | "h3"; text: string }) {
  const indent = level === "h1" ? 0 : level === "h2" ? 12 : 24;
  const pillBg =
    level === "h1" ? "var(--bg-olive-light)" : level === "h2" ? "var(--bg-warm)" : "var(--bg-card)";
  const pillColor =
    level === "h1" ? "var(--accent-dark)" : "var(--text-secondary)";
  const fontSize = level === "h1" ? "13px" : level === "h2" ? "12px" : "11px";
  const fontWeight = level === "h1" ? 700 : level === "h2" ? 600 : 500;

  return (
    <div className="flex items-start gap-2 py-[3px]" style={{ paddingLeft: indent }}>
      <span
        className="inline-flex items-center justify-center px-[6px] py-[1px] rounded-[3px] font-[family-name:var(--font-mono)] text-[9px] font-semibold uppercase shrink-0 mt-[2px]"
        style={{ background: pillBg, color: pillColor, border: `1px solid ${pillColor}20` }}
      >
        {level}
      </span>
      <span style={{ fontSize, fontWeight }}>{text}</span>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
