"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  NlpResult,
  NlpTerm,
  KeywordTerm,
  SerpResult,
  Paa,
  HaloscanOverview,
  Section as NlpSection,
  Entity,
} from "@/lib/analysis";
import { buildKeywordRegex, computeDetailedScore, type DetailedScore } from "@/lib/scoring";
import {
  extractGeoSignals,
  EMPTY_GEO_SIGNALS,
  GEO_LABELS,
  type GeoSignals,
} from "@/lib/geo-scoring";
import { faviconUrl } from "@/lib/favicon";
import { EditorToolbar } from "./toolbar";
import { ShareBriefPanel } from "../share-brief-panel";
import { StatusPicker } from "../status-picker";
import { TagPicker, type TagDTO } from "../tag-picker";
import type { WorkflowStatus } from "../workflow-status";
import { ExportMenu } from "./export-menu";

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
  // Position du domaine du dossier dans la SERP (top 100), null si hors top 100
  // ou si pas de site rattaché.
  position: number | null;
  /** Statut éditorial initial. */
  workflowStatus: WorkflowStatus;
  /** Tags initialement attachés. */
  initialTags: TagDTO[];
  /** Catalogue des tags disponibles à attacher. */
  availableTags: TagDTO[];
  /**
   * Endpoint PATCH utilisé pour la sauvegarde débouncée du contenu.
   * - `/api/briefs/<id>` pour les users authentifiés
   * - `/api/share/<token>/briefs/<id>` pour les accès publics via partage
   */
  saveEndpoint?: string;
  /**
   * Endpoint POST/DELETE pour attacher/détacher un tag à ce brief.
   * - `/api/briefs/<id>/tags` (auth) ou `/api/share/<token>/briefs/<id>/tags`
   */
  tagsEndpoint?: string;
  /** Endpoint POST pour créer un nouveau tag : `/api/tags` ou `/api/share/<token>/tags`. */
  tagsCreateEndpoint?: string;
  /**
   * URL de base où servir l'export et la version imprimable.
   * - `/api/briefs/<id>/export` côté backoffice
   * - `/api/share/<token>/briefs/<id>/export` côté client
   */
  exportEndpoint?: string;
  /** URL de la page imprimable (PDF via window.print). */
  printUrl?: string;
  /** Masquer le bouton "Nouvelle analyse" (ex. en mode partage). */
  hideNewAnalysis?: boolean;
  /** Token de partage déjà actif sur le brief (mode consultant uniquement). */
  shareToken?: string | null;
};

type Tab = "editor" | "serp" | "insights";

export function BriefEditor(props: BriefEditorProps) {
  const { id, keyword, country, folder, initialHtml, nlp, serp, paa, haloscan, position } = props;
  const saveEndpoint = props.saveEndpoint ?? `/api/briefs/${id}`;
  const tagsEndpoint = props.tagsEndpoint ?? `/api/briefs/${id}/tags`;
  const tagsCreateEndpoint = props.tagsCreateEndpoint ?? `/api/tags`;
  const exportEndpoint = props.exportEndpoint ?? `/api/briefs/${id}/export`;
  const printUrl = props.printUrl ?? `/api/briefs/${id}/print`;
  const hideNewAnalysis = props.hideNewAnalysis ?? false;

  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>(props.workflowStatus);
  const [tags, setTags] = useState<TagDTO[]>(props.initialTags);

  async function changeWorkflowStatus(next: WorkflowStatus) {
    const prev = workflowStatus;
    setWorkflowStatus(next);
    const res = await fetch(saveEndpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowStatus: next }),
    });
    if (!res.ok) setWorkflowStatus(prev);
  }

  async function attachTagToThisBrief(tagId: string) {
    const tag = props.availableTags.find((t) => t.id === tagId) ?? tags.find((t) => t.id === tagId);
    if (!tag) return;
    setTags((curr) => (curr.some((x) => x.id === tagId) ? curr : [...curr, tag]));
    const res = await fetch(tagsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) setTags((curr) => curr.filter((x) => x.id !== tagId));
  }

  async function detachTagFromThisBrief(tagId: string) {
    const removed = tags.find((t) => t.id === tagId);
    setTags((curr) => curr.filter((x) => x.id !== tagId));
    const res = await fetch(`${tagsEndpoint}?tagId=${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    });
    if (!res.ok && removed) setTags((curr) => [...curr, removed]);
  }

  async function createTagInline(name: string, color: string): Promise<TagDTO | null> {
    const res = await fetch(tagsCreateEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag?: TagDTO };
    const tag = data.tag;
    if (!tag) return null;
    setTags((curr) => (curr.some((x) => x.id === tag.id) ? curr : [...curr, tag]));
    const attach = await fetch(tagsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    if (!attach.ok) {
      setTags((curr) => curr.filter((x) => x.id !== tag.id));
      return null;
    }
    return tag;
  }

  const editorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("editor");
  const [editorData, setEditorData] = useState({ text: "", h1s: [] as string[], h2s: [] as string[], h3s: [] as string[] });
  const [geoSignals, setGeoSignals] = useState<GeoSignals>(EMPTY_GEO_SIGNALS);
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
    setGeoSignals(extractGeoSignals(el));
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

  const score: DetailedScore = useMemo(
    () => computeDetailedScore(editorData, nlp, geoSignals),
    [editorData, nlp, geoSignals],
  );

  // Premier save : on rattrape les briefs avec un score obsolète en BDD
  // (changement de formule, debounce raté à la session précédente…). On
  // déclenche dès le 1er calcul utile et on ne le rejoue pas.
  const initialSaveDone = useRef(false);
  useEffect(() => {
    if (initialSaveDone.current) return;
    if (editorData.text.length === 0 && !editorRef.current?.innerHTML) return;
    initialSaveDone.current = true;
    fetch(saveEndpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: score.total }),
    }).catch(() => {
      // best-effort : si ça échoue, le debounce save reprendra plus tard.
    });
  }, [editorData.text, score.total, saveEndpoint]);

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
          <StatusPicker status={workflowStatus} onChange={changeWorkflowStatus} size="sm" />
          <TagPicker
            attached={tags}
            available={props.availableTags}
            onAttach={attachTagToThisBrief}
            onDetach={detachTagFromThisBrief}
            onCreate={createTagInline}
            onDeleteTag={
              // Suppression seulement côté backoffice authentifié (pas exposée
              // aux vues partagées /share : le client ne supprime que ses
              // propres détachements).
              props.tagsCreateEndpoint && !props.tagsCreateEndpoint.includes("/share")
                ? async (tagId) => {
                    const r = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
                    if (r.ok) setTags((curr) => curr.filter((t) => t.id !== tagId));
                  }
                : undefined
            }
            size="sm"
            disabledReason={
              folder
                ? null
                : "Rattache le brief à un client pour ajouter des tags."
            }
          />
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && <span className="text-[11px] text-[var(--text-muted)]">Enregistrement…</span>}
          {saveStatus === "saved" && <span className="text-[11px] text-[var(--green)] font-semibold">✓ Enregistré</span>}
          <ExportMenu exportEndpoint={exportEndpoint} printUrl={printUrl} />
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
                spellCheck
                lang={spellcheckLang(country)}
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
            serp={serp}
            paa={paa}
            haloscan={haloscan}
            position={position}
            folderWebsite={folder?.website ?? null}
            editorText={editorData.text}
            editorH1Count={editorData.h1s.length}
            editorH1HasKw={
              nlp
                ? editorData.h1s.some((h) =>
                    buildKeywordRegex(nlp.exactKeyword.keyword).test(h),
                  )
                : false
            }
            editorH2s={editorData.h2s}
            editorH3s={editorData.h3s}
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
        <SerpScoreChart serp={serp} myScore={score.total} className="mt-6 max-w-[880px]" />
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
  serp,
  paa,
  haloscan,
  position,
  folderWebsite,
  editorText,
  editorH1Count,
  editorH1HasKw,
  editorH2s,
  editorH3s,
  insertTermAtCursor,
  insertPaaAsH2,
}: {
  scoreTotal: number;
  wc: number;
  score: DetailedScore;
  nlp: NlpResult | null;
  serp: SerpResult[];
  paa: Paa[];
  haloscan: HaloscanOverview | null;
  position: number | null;
  folderWebsite: string | null;
  editorText: string;
  editorH1Count: number;
  editorH1HasKw: boolean;
  editorH2s: string[];
  editorH3s: string[];
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
    { label: "GEO (LLMs)", s: { score: score.geo.total, max: 100, details: {} }, color: "var(--purple)",
      tip: score.geo.total < 60
        ? "↑ Ajoutez tableau / FAQ / liste / résumé / chiffre pour citation IA"
        : "✓ Bons signaux GEO" },
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
    // Regex tolérante aux flexions (genre/nombre/accents) : « meilleurs
    // transports » matche aussi un keyword « meilleur transport ».
    kwCount = (lower.match(buildKeywordRegex(ek.keyword)) ?? []).length;
    density = wc > 0 ? Math.round(((kwCount * ek.keyword.split(/\s+/).length) / wc) * 10000) / 100 : 0;
    const intro = editorText.trim().split(/\s+/).slice(0, 100).join(" ");
    inIntro = buildKeywordRegex(ek.keyword).test(intro);
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
          {nlp?.intent && (
            <span
              className="self-start mt-1 px-[8px] py-[2px] rounded-[var(--radius-pill)] text-[9px] font-semibold uppercase tracking-[0.5px]"
              style={(() => {
                switch (nlp.intent) {
                  case "transactional": return { background: "var(--orange-bg)", color: "var(--orange)" };
                  case "informational": return { background: "var(--blue-bg)", color: "var(--blue)" };
                  case "commercial":    return { background: "var(--bg-olive-light)", color: "var(--accent-dark)" };
                  case "navigational":  return { background: "#FFF0F0", color: "var(--red)" };
                  case "local":         return { background: "var(--green-bg)", color: "var(--green)" };
                  default:              return {};
                }
              })()}
              title="Intent de recherche détecté pour ce keyword"
            >
              {nlp.intent === "transactional" ? "Transactionnel"
                : nlp.intent === "informational" ? "Informationnel"
                : nlp.intent === "commercial" ? "Comparatif"
                : nlp.intent === "navigational" ? "Marque/Produit"
                : "Local"}
            </span>
          )}
        </div>
      </div>

      {/* Comparaison avec la concurrence SERP */}
      <CompetitorScoreRow scoreTotal={scoreTotal} serp={serp} />

      {/* Stats clés du mot-clé */}
      <KeywordStatsRow
        volume={haloscan?.search_volume ?? null}
        kgr={haloscan?.kgr ?? null}
        position={position}
        folderWebsite={folderWebsite}
      />

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
        <Section title="Mot-clé exact (densité)" dotColor="var(--accent)" collapsible defaultOpen={false}>
          <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold px-3 py-[7px] bg-[var(--bg-warm)] rounded-[var(--radius-xs)] mb-[10px] text-center">
            &quot;{ek.keyword}&quot;
          </div>
          <Metric label="Occurrences" value={`${kwCount} / ~${ek.avgCount}`} tone={kwCount >= ek.avgCount * 0.7 ? "good" : "warn"} />
          <Metric label="Densité" value={`${density}% / ${ek.idealDensityMin.toFixed(1)} à ${ek.idealDensityMax.toFixed(1)}%`}
            tone={density >= ek.idealDensityMin && density <= ek.idealDensityMax ? "good" : density > ek.idealDensityMax ? "bad" : "warn"} />
          <Metric label="Dans l'intro" value={inIntro ? "✓" : "✗"} tone={inIntro ? "good" : "warn"} />
          <Metric label="Dans le H1" value={`${editorH1HasKw ? "✓" : "✗"} (${ek.inH1Pct}% SERP)`} tone={editorH1HasKw ? "good" : "warn"} />
          <Metric label="Nb de H1" value={`${editorH1Count} / 1`} tone={editorH1Count === 1 ? "good" : editorH1Count === 0 ? "warn" : "bad"} last />
        </Section>
      )}

      {nlp && (((nlp.keywordTerms?.length ?? 0) + essential.length + important.length + opportunity.length) > 0) && (
        <Section title="Champ sémantique" dotColor="var(--purple)">
          {(nlp.keywordTerms?.length ?? 0) > 0 && (
            <div className="mb-[10px]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.5px] mb-[6px]" style={{ color: "var(--red)" }}>
                Essentiels — mot-clé principal
              </div>
              <KeywordTermsList terms={nlp.keywordTerms!} lower={lower} onInsert={insertTermAtCursor} />
            </div>
          )}
          {essential.length > 0 && (
            <TierTags
              label={(nlp.keywordTerms?.length ?? 0) > 0 ? "Essentiels — autres" : "Essentiels"}
              color="var(--red)" bg="#FFF0F0" border="#E8BCBC"
              terms={essential} lower={lower} onInsert={insertTermAtCursor}
            />
          )}
          <TierTags label="Importants" color="var(--orange)" bg="var(--orange-bg)" border="#E8D6A0" terms={important} lower={lower} onInsert={insertTermAtCursor} />
          <TierTags label="Opportunité" color="var(--blue)" bg="var(--blue-bg)" border="#B8D0E8" terms={opportunity} lower={lower} onInsert={insertTermAtCursor} />
        </Section>
      )}

      {nlp?.semanticClusters && nlp.semanticClusters.length > 0 && (
        <Section title="Clusters thématiques (IA)" dotColor="var(--blue)" collapsible defaultOpen={false}>
          <div className="text-[10px] text-[var(--text-muted)] mb-[8px] italic">
            Termes regroupés par champ lexical via embeddings.
          </div>
          {nlp.semanticClusters.map((c) => (
            <div key={c.label} className="mb-[10px]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)] mb-[4px]">
                {c.label} <span className="opacity-60 font-normal">({c.terms.length})</span>
              </div>
              <div className="flex flex-wrap gap-[3px]">
                {c.terms.map((t) => (
                  <button
                    key={t}
                    onClick={() => insertTermAtCursor(t)}
                    className="inline-flex items-center px-[7px] py-[2px] rounded-full text-[10px] bg-[var(--bg-warm)] border border-[var(--border)] hover:bg-[var(--bg-olive-light)]"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {nlp?.sections && nlp.sections.length > 0 && (
        <Section title="Sections concurrentes" dotColor="var(--orange)">
          <CompetitorSections
            sections={nlp.sections}
            editorH2s={editorH2s}
            editorH3s={editorH3s}
            onInsert={insertPaaAsH2}
          />
        </Section>
      )}

      {nlp?.opportunities && nlp.opportunities.length > 0 && (
        <Section title="Opportunités de différentiation" dotColor="var(--green)">
          <div className="text-[10px] text-[var(--text-muted)] mb-[8px] italic">
            Questions PAA non couvertes par les concurrents. Cliquer pour insérer comme H2.
          </div>
          <div className="flex flex-col gap-1">
            {nlp.opportunities.map((o, i) => (
              <button
                key={i}
                onClick={() => insertPaaAsH2(o.text)}
                title={`Couvert par seulement ${o.competitorCoverage}% des concurrents — angle unique`}
                className="flex items-center gap-2 px-[10px] py-[7px] bg-[var(--green-bg)] border border-[var(--green)] rounded-[var(--radius-xs)] text-left text-[12px] leading-[1.4] hover:opacity-80 transition-opacity"
                style={{ color: "var(--green)" }}
              >
                <span className="font-bold text-[14px] shrink-0">+</span>
                <span className="flex-1">{o.text}</span>
                <span className="text-[9px] font-[family-name:var(--font-mono)] shrink-0 opacity-80">
                  {o.competitorCoverage}%
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {nlp?.entities && nlp.entities.length > 0 && (
        <Section title="Entités à mentionner" dotColor="var(--green)">
          <EntityList entities={nlp.entities} editorText={editorText} onInsert={insertTermAtCursor} />
        </Section>
      )}

      {paa.length > 0 && (
        <Section title="People Also Ask" dotColor="var(--blue)" collapsible defaultOpen={false}>
          <PaaCoverageList paa={paa} editorText={editorText} keyword={ek?.keyword ?? ""} onInsert={insertPaaAsH2} />
        </Section>
      )}

      {nlp && (
        <Section title="Benchmarks SERP" dotColor="var(--green)" collapsible defaultOpen={false}>
          <BenchRow label="Plage de mots" value={`${nlp.minWordCount} à ${nlp.maxWordCount}`} />
          <BenchRow label="Moyenne" value={String(nlp.avgWordCount)} />
          <BenchRow label="Titres" value={String(nlp.avgHeadings)} />
          <BenchRow label="Paragraphes" value={String(nlp.avgParagraphs)} last />
          {serp.length > 0 && (
            <div className="mt-[10px] pt-[10px] border-t border-[var(--border)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] mb-[6px]">
                Concurrents top {serp.length}
              </div>
              <div className="flex flex-col gap-[2px]">
                {serp.map((r) => {
                  const wc = r.wordCount ?? 0;
                  const wcLabel = wc > 0 ? `${wc.toLocaleString("fr-FR")} mots` : "—";
                  let host = "";
                  try { host = new URL(r.link).hostname.replace(/^www\./, ""); } catch {}
                  const fav = host ? faviconUrl(host) : null;
                  return (
                    <a
                      key={r.position}
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 py-[3px] text-[11px] hover:bg-[var(--bg-warm)] rounded-[var(--radius-xs)] px-1 -mx-1"
                      title={r.link}
                    >
                      <span className="text-[10px] font-[family-name:var(--font-mono)] text-[var(--text-muted)] w-[18px] shrink-0">
                        {r.position}.
                      </span>
                      {fav && (
                        <img
                          src={fav}
                          alt=""
                          width={14}
                          height={14}
                          className="shrink-0 rounded-[2px]"
                          loading="lazy"
                        />
                      )}
                      <span className="flex-1 truncate text-[var(--text-secondary)]">
                        {host || r.link}
                      </span>
                      <span
                        className={`shrink-0 font-[family-name:var(--font-mono)] text-[10px] ${
                          wc === 0 ? "text-[var(--red)]" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {wcLabel}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Checklist GEO : 5 patterns appréciés par les LLMs. Pèse 10 pts. */}
      <Section title="Optimisation GEO" dotColor="var(--purple)">
        <p className="text-[11px] text-[var(--text-muted)] mb-[10px] leading-[1.4]">
          Patterns appréciés par les moteurs génératifs (Perplexity, ChatGPT…) pour citer ton contenu.
        </p>
        <GeoChecklistItem label={GEO_LABELS.table} ok={score.geo.table.ok} />
        <GeoChecklistItem label={GEO_LABELS.bulletList} ok={score.geo.bulletList.ok} />
        <GeoChecklistItem label={GEO_LABELS.quickSummary} ok={score.geo.quickSummary.ok} />
        <GeoChecklistItem label={GEO_LABELS.faq} ok={score.geo.faq.ok} />
        <GeoChecklistItem label={GEO_LABELS.statistics} ok={score.geo.statistics.ok} last />
      </Section>
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

// ─── Sections concurrentes détectées dans le top 10 ─────────────────────────
function CompetitorSections({
  sections,
  editorH2s,
  editorH3s,
  onInsert,
}: {
  sections: NlpSection[];
  editorH2s: string[];
  editorH3s: string[];
  onInsert: (text: string) => void;
}) {
  const userHeadings = [...editorH2s, ...editorH3s].map((h) => h.toLowerCase());
  // Une section est couverte si au moins un key term (ou sa forme) apparaît
  // dans un H2/H3 de l'utilisateur.
  const coverage = sections.map((s) => {
    const covered = s.keyTerms.some((t) =>
      userHeadings.some((h) => h.includes(t.toLowerCase())),
    );
    return { section: s, covered };
  });
  const coveredCount = coverage.filter((c) => c.covered).length;
  return (
    <div>
      <div className="text-[11px] text-[var(--text-muted)] mb-[8px]">
        <span className="font-semibold text-[var(--text)]">{coveredCount}/{sections.length}</span> sections couvertes. Cliquer pour insérer comme H2.
      </div>
      <div className="flex flex-col gap-1">
        {coverage.map(({ section, covered }) => {
          const titleCase =
            section.label.charAt(0).toUpperCase() + section.label.slice(1);
          const suggestedHeading = section.sampleHeadings[0] ?? titleCase;
          return (
            <button
              key={section.label}
              onClick={() => onInsert(suggestedHeading)}
              title={`Exemples concurrents : ${section.sampleHeadings.slice(0, 3).join(" · ")}`}
              className="group flex items-center gap-2 px-[10px] py-[7px] bg-[var(--bg-card)] border rounded-[var(--radius-xs)] text-left text-[12px] leading-[1.4] hover:bg-[var(--bg-olive-light)] transition-colors"
              style={{
                borderColor: covered ? "var(--green)" : "var(--border)",
                background: covered ? "var(--green-bg)" : undefined,
              }}
            >
              <span
                className="w-[14px] h-[14px] rounded-full border flex items-center justify-center text-[9px] shrink-0"
                style={{
                  borderColor: covered ? "var(--green)" : "var(--border-strong)",
                  background: covered ? "var(--green)" : "transparent",
                  color: covered ? "white" : "var(--text-muted)",
                }}
              >
                {covered ? "✓" : ""}
              </span>
              <span className="flex-1 font-medium capitalize">{titleCase}</span>
              <span className="text-[9px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] shrink-0">
                {section.hits}/{section.total}
              </span>
              <span className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.5px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                → H2
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Entités nommées à mentionner (marques, organismes, acronymes) ──────────
function EntityList({
  entities,
  editorText,
  onInsert,
}: {
  entities: Entity[];
  editorText: string;
  onInsert: (t: string) => void;
}) {
  const lower = editorText.toLowerCase();
  const rows = entities.map((e) => ({
    entity: e,
    mentioned: lower.includes(e.label.toLowerCase()),
  }));
  const mentioned = rows.filter((r) => r.mentioned).length;
  return (
    <div>
      <div className="text-[11px] text-[var(--text-muted)] mb-[8px]">
        <span className="font-semibold text-[var(--text)]">{mentioned}/{entities.length}</span> entités citées. Marques, organismes et acronymes vus chez les concurrents.
      </div>
      <div className="flex flex-wrap gap-[5px]">
        {rows.map(({ entity, mentioned }) => (
          <button
            key={entity.label}
            onClick={() => onInsert(entity.label)}
            title={`Cité par ${entity.hits}/${entity.total} concurrents (${entity.totalOccurrences} occurrences)`}
            className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[11px] font-medium border hover:scale-[1.03] transition-transform"
            style={{
              background: mentioned ? "var(--green-bg)" : "var(--bg-card)",
              borderColor: mentioned ? "var(--green)" : "var(--border)",
              color: mentioned ? "var(--green)" : "var(--text)",
            }}
          >
            {entity.label}
            <span className="text-[9px] font-[family-name:var(--font-mono)] opacity-75">
              {entity.hits}/{entity.total}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── People Also Ask avec détection de couverture ───────────────────────────
function PaaCoverageList({
  paa,
  editorText,
  keyword,
  onInsert,
}: {
  paa: Paa[];
  editorText: string;
  keyword: string;
  onInsert: (q: string) => void;
}) {
  const QUESTION_WORDS = new Set([
    "est", "ce", "qui", "que", "quoi", "qu", "qu'est", "qu'il", "où", "quand",
    "comment", "pourquoi", "combien", "quel", "quelle", "quels", "quelles",
    "peut", "peuvent", "fait", "faire", "sont",
    // Mots vagues / quantifieurs très communs : présents dans n'importe
    // quel texte de brief, ne sont pas distinctifs d'une question PAA.
    "plus", "moins", "très", "tout", "tous", "toute", "toutes",
    "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
    "bien", "mieux", "aussi", "encore", "déjà", "même",
  ]);
  // Mots du keyword à exclure des tokens distinctifs : ils sont quasi
  // toujours présents dans tout texte du brief, sinon TOUTE PAA partageant
  // un mot avec le keyword serait marquée 'traitée' à tort. On ajoute aussi
  // les variantes singulier/pluriel.
  const kwTokens = new Set<string>();
  keyword
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .forEach((w) => {
      kwTokens.add(w);
      if (w.endsWith("s")) kwTokens.add(w.slice(0, -1));
      else kwTokens.add(w + "s");
    });
  const lower = editorText.toLowerCase();
  const rows = paa.slice(0, 5).map((q) => {
    const tokens = q.question
      .toLowerCase()
      .replace(/[^a-zà-ÿ0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !QUESTION_WORDS.has(w) &&
          !/^\d+$/.test(w) &&
          !kwTokens.has(w),
      );
    if (tokens.length === 0) return { q, covered: false };
    const hits = tokens.filter((t) => lower.includes(t)).length;
    // Couverte : au moins 70% des tokens DISTINCTIFS (hors keyword) sont
    // présents (min 2). 50% était trop laxiste : "Quelle est la basket
    // homme la plus vendue ?" sortait déjà 'couvert' parce que "basket"
    // et "homme" sont partout dans le brief.
    const threshold = Math.max(2, Math.ceil(tokens.length * 0.7));
    return { q, covered: hits >= threshold };
  });
  const coveredCount = rows.filter((r) => r.covered).length;
  return (
    <div>
      <div className="text-[11px] text-[var(--text-muted)] mb-[8px]">
        <span className="font-semibold text-[var(--text)]">{coveredCount}/{rows.length}</span> questions traitées.
      </div>
      <div className="flex flex-col gap-1">
        {rows.map(({ q, covered }, i) => (
          <button
            key={i}
            onClick={() => onInsert(q.question)}
            title="Cliquer pour insérer comme H2"
            className="group flex items-start gap-2 px-[10px] py-2 border rounded-[var(--radius-xs)] text-left text-[12px] leading-[1.4] hover:bg-[var(--bg-olive-light)] transition-colors"
            style={{
              background: covered ? "var(--green-bg)" : "var(--bg-card)",
              borderColor: covered ? "var(--green)" : "var(--border)",
            }}
          >
            <span
              className="w-[14px] h-[14px] rounded-full border flex items-center justify-center text-[9px] mt-[2px] shrink-0"
              style={{
                borderColor: covered ? "var(--green)" : "var(--border-strong)",
                background: covered ? "var(--green)" : "transparent",
                color: covered ? "white" : "var(--text-muted)",
              }}
            >
              {covered ? "✓" : "?"}
            </span>
            <span className="flex-1">{q.question}</span>
            <span className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.5px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              → H2
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TierTags({ label, color, bg, border, terms, lower, onInsert }: {
  label: string; color: string; bg: string; border: string; terms: NlpTerm[]; lower: string; onInsert: (t: string) => void;
}) {
  if (!terms.length) return null;
  // Un terme est "utilisé" si sa forme affichée OU l'une de ses variantes
  // morphologiques apparaît dans le contenu.
  const used = terms.filter((k) => {
    if (k.variants && k.variants.length > 0) {
      return k.variants.some((v) => lower.includes(v.toLowerCase()));
    }
    return lower.includes(k.term.toLowerCase());
  }).length;
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
          // Compte des occurrences actuelles dans l'éditeur. Pour les
          // unigrammes on matche toutes les variantes morphologiques (stemming)
          // afin que "travaille", "travaillé", "travaux" comptent tous pour le
          // chip "travaux".
          const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const pattern =
            k.variants && k.variants.length > 0
              ? k.variants.map(escape).join("|")
              : escape(k.term);
          const rx = new RegExp(`\\b(?:${pattern})\\b`, "gi");
          const currentCount = (lower.match(rx) ?? []).length;
          const hasRange = typeof k.minCount === "number" && k.maxCount > 0;
          const rangeLabel = hasRange
            ? k.minCount === k.maxCount
              ? String(k.maxCount)
              : `${k.minCount}-${k.maxCount}`
            : null;
          const hasTarget = typeof k.avgCount === "number" && k.avgCount > 0;

          // Couleur : vert si dans la fourchette des concurrents, orange si on
          // dépasse la borne haute, défaut sinon.
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
                  ? `Fourchette concurrents : ${k.minCount}-${k.maxCount} occurrences (moyenne ${k.avgCount}). Actuel : ${currentCount}.`
                  : "Cliquer pour insérer"
              }
              className="inline-flex items-center gap-[5px] px-[10px] py-[4px] rounded-full text-[11px] font-medium border hover:scale-[1.03] transition-transform"
              style={style}
            >
              {k.term}
              {rangeLabel && (
                <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
                  {currentCount > 0 ? `${currentCount}/${rangeLabel}` : rangeLabel}
                  {hasTarget && k.minCount !== k.maxCount && (
                    <span className="opacity-60"> (~{k.avgCount})</span>
                  )}
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

function KeywordTermsList({
  terms,
  lower,
  onInsert,
}: {
  terms: KeywordTerm[];
  lower: string;
  onInsert: (t: string) => void;
}) {
  if (!terms.length) return null;
  return (
    <div className="flex flex-wrap gap-[5px]">
      {terms.map((k) => {
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(
          `(?:^|[^a-zà-ÿ0-9])${escape(k.term)}(?=$|[^a-zà-ÿ0-9])`,
          "gi",
        );
        const currentCount = (lower.match(rx) ?? []).length;
        const hasRange = k.maxCount > 0;
        const rangeLabel = hasRange
          ? k.minCount === k.maxCount
            ? String(k.maxCount)
            : `${k.minCount}-${k.maxCount}`
          : null;
        const inRange =
          hasRange && currentCount >= k.minCount && currentCount <= k.maxCount;
        const overRange = hasRange && currentCount > k.maxCount;
        const tone =
          currentCount === 0
            ? "missing"
            : inRange
              ? "good"
              : overRange
                ? "over"
                : "low";
        const baseStyle =
          k.kind === "exact"
            ? { background: "var(--bg-black)", borderColor: "var(--bg-black)", color: "var(--text-inverse)" }
            : k.kind === "extension"
              ? { background: "var(--blue-bg)", borderColor: "var(--blue)", color: "var(--blue)" }
              : { background: "var(--bg-olive-light)", borderColor: "var(--accent-dark)", color: "var(--accent-dark)" };
        const overlay =
          tone === "good"
            ? { background: "var(--green-bg)", borderColor: "var(--green)", color: "var(--green)" }
            : tone === "over"
              ? { background: "var(--orange-bg)", borderColor: "var(--orange)", color: "var(--orange)" }
              : null;
        const style = overlay ?? baseStyle;
        return (
          <button
            key={k.term}
            onClick={() => onInsert(k.term)}
            title={
              k.kind === "extension"
                ? `Extension détectée chez ${k.presence}% des concurrents`
                : k.kind === "exact"
                  ? "Keyword exact"
                  : "Sous-partie du keyword"
            }
            className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-full text-[12px] font-medium border transition-colors hover:opacity-90"
            style={style}
          >
            {k.term}
            {rangeLabel && (
              <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
                {currentCount}/{rangeLabel}
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

function GeoChecklistItem({
  label,
  ok,
  last,
}: {
  label: string;
  ok: boolean;
  last?: boolean;
}) {
  const color = ok ? "var(--green)" : "var(--text-muted)";
  return (
    <div className={`flex items-center gap-2 py-[7px] text-[12px] ${last ? "" : "border-b border-[var(--border)]"}`}>
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
        style={{ background: ok ? "var(--green-bg)" : "var(--bg-warm)", color }}
      >
        {ok ? (
          <svg width="9" height="9" viewBox="0 0 20 20" fill="none">
            <path d="M4 11l4 4 8-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="w-[6px] h-[6px] rounded-full" style={{ background: color }} />
        )}
      </span>
      <span className="flex-1" style={{ color: ok ? "var(--text)" : "var(--text-secondary)" }}>{label}</span>
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

  const haloHasData =
    halo &&
    (halo.search_volume != null ||
      halo.cpc != null ||
      halo.kgr != null ||
      halo.allintitleCount != null ||
      halo.difficulty != null ||
      halo.visibilityIndex != null ||
      halo.resultCount != null);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 max-w-[1100px]">
      <InsightCard title="Données mot-clé" dotColor="var(--accent)">
        {haloHasData ? (
          <>
            {halo?.search_volume != null && (
              <InsightMetric
                label="Volume mensuel"
                value={halo.search_volume.toLocaleString("fr-FR")}
                tooltip="Recherches mensuelles moyennes (Haloscan)"
              />
            )}
            {halo?.cpc != null && (
              <InsightMetric label="CPC" value={`${halo.cpc.toFixed(2)} €`} tooltip="Coût par clic Google Ads (Haloscan)" />
            )}
            {halo?.kgr != null && (
              <InsightMetric
                label="KGR"
                value={halo.kgr.toFixed(2)}
                tooltip="Keyword Golden Ratio. < 0.25 = excellent, < 1 = correct, > 1 = trop concurrentiel."
              />
            )}
            {halo?.allintitleCount != null && (
              <InsightMetric
                label="Allintitle"
                value={halo.allintitleCount.toLocaleString("fr-FR")}
                tooltip="Pages avec le mot-clé exact dans le title (Haloscan)"
              />
            )}
            {halo?.difficulty != null && (
              <InsightMetric label="Difficulté" value={`${halo.difficulty}/100`} tooltip="Difficulté SEO estimée (Haloscan)" />
            )}
            {halo?.visibilityIndex != null && (
              <InsightMetric
                label="Visibilité"
                value={halo.visibilityIndex.toFixed(1)}
                tooltip="Indice de visibilité du mot-clé (Haloscan)"
              />
            )}
            {halo?.resultCount != null && (
              <InsightMetric
                label="Résultats Google"
                value={halo.resultCount.toLocaleString("fr-FR")}
                tooltip="Nombre total de pages indexées Google sur le mot-clé"
              />
            )}
          </>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">
            Métriques Haloscan non disponibles pour ce mot-clé (souvent le cas pour la longue traîne ou les sujets adultes).
          </p>
        )}
      </InsightCard>

      {paa.length > 0 && (
        <InsightCard title="People Also Ask" dotColor="var(--blue)">
          {paa.slice(0, 5).map((q, i) => (
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

function CompetitorScoreRow({ scoreTotal, serp }: { scoreTotal: number; serp: SerpResult[] }) {
  const scored = serp.filter((r): r is SerpResult & { score: number } => typeof r.score === "number");
  if (scored.length === 0) return null;
  const avg = Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length);
  const best = scored.reduce((b, r) => (r.score > b.score ? r : b), scored[0]);
  const gapAvg = scoreTotal - avg;
  const gapBest = scoreTotal - best.score;

  const tone = (gap: number): "good" | "warn" | "bad" =>
    gap >= 0 ? "good" : gap >= -10 ? "warn" : "bad";

  let bestHost = "";
  try {
    bestHost = new URL(best.link).hostname.replace(/^www\./, "");
  } catch {
    bestHost = best.link;
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 mb-5">
      <div className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-2">
        Concurrence SERP
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CompareCell
          label="Moyenne"
          value={`${avg}/100`}
          gap={gapAvg}
          tone={tone(gapAvg)}
          tooltip={`Moyenne du score SEO sur les ${scored.length} concurrents crawlés.`}
        />
        <CompareCell
          label="Meilleur"
          value={`${best.score}/100`}
          gap={gapBest}
          tone={tone(gapBest)}
          tooltip={`Meilleur score : ${bestHost} (position ${best.position}).`}
        />
      </div>
    </div>
  );
}

function CompareCell({
  label,
  value,
  gap,
  tone,
  tooltip,
}: {
  label: string;
  value: string;
  gap: number;
  tone: "good" | "warn" | "bad";
  tooltip: string;
}) {
  const palette: Record<typeof tone, string> = {
    good: "var(--green)",
    warn: "var(--orange)",
    bad: "var(--red)",
  };
  const color = palette[tone];
  const sign = gap > 0 ? "+" : "";
  return (
    <div title={tooltip} className="cursor-help">
      <div className="text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)] mb-[2px]">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-[family-name:var(--font-mono)] font-semibold text-[15px]">{value}</span>
        <span className="text-[11px] font-semibold font-[family-name:var(--font-mono)]" style={{ color }}>
          {sign}
          {gap}
        </span>
      </div>
    </div>
  );
}

function KeywordStatsRow({
  volume,
  kgr,
  position,
  folderWebsite,
}: {
  volume: number | null;
  kgr: number | null;
  position: number | null;
  folderWebsite: string | null;
}) {
  // Échelle position : top 3 vert foncé, top 10 vert, top 30 orange, au-delà rouge.
  const positionTone =
    position == null
      ? "muted"
      : position <= 3
        ? "best"
        : position <= 10
          ? "good"
          : position <= 30
            ? "warn"
            : "bad";
  // KGR : vert quand opportunité (< 0.25), neutre sinon. Pas de rouge :
  // un KGR élevé est un signal informatif, pas une erreur.
  const kgrTone = kgr != null && kgr < 0.25 ? "good" : "muted";

  return (
    <div className="grid grid-cols-3 gap-2 mb-5">
      <KeyStat
        label="Volume"
        value={volume != null ? volume.toLocaleString("fr-FR") : "N/A"}
        tooltip="Volume de recherche mensuel (Haloscan)"
        tone={volume != null ? "info" : "muted"}
      />
      <KeyStat
        label="KGR"
        value={kgr != null ? kgr.toFixed(2) : "N/A"}
        tooltip="Keyword Golden Ratio. < 0.25 excellent, < 1 correct, > 1 trop concurrentiel."
        tone={kgrTone}
      />
      <KeyStat
        label="Position"
        value={position != null ? `#${position}` : "N/A"}
        tooltip={
          folderWebsite
            ? `Position de ${folderWebsite} dans Google (top 100). N/A = au-delà du top 100.`
            : "Rattache un client avec un site pour suivre ta position."
        }
        tone={positionTone}
      />
    </div>
  );
}

type StatTone = "best" | "good" | "warn" | "bad" | "info" | "muted";

function KeyStat({
  label,
  value,
  tooltip,
  tone,
}: {
  label: string;
  value: string;
  tooltip: string;
  tone: StatTone;
}) {
  const palette: Record<StatTone, { bg: string; color: string; border: string }> = {
    best: { bg: "#0E5132", color: "#FFFFFF", border: "#0E5132" },
    good: { bg: "var(--bg-card)", color: "var(--green)", border: "var(--green)" },
    warn: { bg: "var(--bg-card)", color: "var(--orange)", border: "var(--orange)" },
    bad: { bg: "var(--bg-card)", color: "var(--red)", border: "var(--red)" },
    info: { bg: "var(--bg-card)", color: "var(--text)", border: "var(--border)" },
    muted: { bg: "var(--bg-card)", color: "var(--text-muted)", border: "var(--border)" },
  };
  const p = palette[tone];
  const isBest = tone === "best";
  return (
    <div
      title={tooltip}
      className="border rounded-[var(--radius-sm)] px-3 py-[10px] flex flex-col items-center cursor-help"
      style={{ background: p.bg, borderColor: isBest ? p.border : `${p.border}40` }}
    >
      <span
        className="text-[9px] font-semibold uppercase tracking-[1px] mb-[3px]"
        style={{ color: isBest ? "rgba(255,255,255,0.7)" : "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="font-[family-name:var(--font-mono)] font-semibold text-[15px] leading-none"
        style={{ color: p.color }}
      >
        {value}
      </span>
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

function InsightMetric({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string;
  tooltip?: string;
}) {
  return (
    <div
      title={tooltip}
      className={`flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0 ${
        tooltip ? "cursor-help" : ""
      }`}
    >
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

function SerpScoreChart({
  serp,
  myScore,
  className = "",
}: {
  serp: SerpResult[];
  myScore: number;
  className?: string;
}) {
  const scored = serp.filter((r): r is SerpResult & { score: number } => typeof r.score === "number");
  if (scored.length === 0) return null;
  const avg = Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length);
  const maxValue = Math.max(100, ...scored.map((r) => r.score), myScore);

  // Bar "Toi" en première position pour bien la voir, puis les concurrents par position SERP.
  const bars: Array<{ key: string; label: string; score: number; isMe: boolean; position?: number }> = [
    { key: "me", label: "Toi", score: myScore, isMe: true },
    ...scored.map((r) => {
      let host = "";
      try {
        host = new URL(r.link).hostname.replace(/^www\./, "");
      } catch {
        host = r.link;
      }
      return {
        key: `${r.position}`,
        label: host,
        score: r.score,
        isMe: false,
        position: r.position,
      };
    }),
  ];

  return (
    <div
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5 ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
            Score SEO concurrents
          </div>
          <div className="text-[12px] text-[var(--text-secondary)] mt-[2px]">
            Moyenne SERP <strong>{avg}/100</strong> · ton score <strong>{myScore}/100</strong>
          </div>
        </div>
      </div>

      <div className="relative">
        {/* Ligne moyenne en pointillés */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-[var(--text-muted)] z-10"
          style={{ bottom: `${(avg / maxValue) * 180}px` }}
          title={`Moyenne SERP : ${avg}/100`}
        >
          <span className="absolute -top-[6px] right-0 text-[9px] font-[family-name:var(--font-mono)] text-[var(--text-muted)] bg-[var(--bg-card)] px-1">
            moy {avg}
          </span>
        </div>

        <div className="flex items-end gap-[6px] h-[200px] border-b border-[var(--border)]">
          {bars.map((b) => {
            const h = Math.max(2, (b.score / maxValue) * 180);
            const color = b.isMe
              ? "var(--bg-black)"
              : b.score >= 70
                ? "var(--green)"
                : b.score >= 40
                  ? "var(--orange)"
                  : "var(--red)";
            return (
              <div
                key={b.key}
                className="flex-1 flex flex-col items-center min-w-0"
                title={`${b.label} : ${b.score}/100${b.position ? ` (position ${b.position})` : ""}`}
              >
                <span className="text-[10px] font-[family-name:var(--font-mono)] font-semibold mb-[3px]">
                  {b.score}
                </span>
                <div
                  className="w-full rounded-t-[3px] transition-all"
                  style={{ height: `${h}px`, background: color }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-[6px] mt-[4px]">
          {bars.map((b) => (
            <div
              key={`l-${b.key}`}
              className="flex-1 text-[9px] text-center text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate"
              title={b.label}
            >
              {b.isMe ? "Toi" : `#${b.position}`}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
          {r.score != null && (
            <div title="Score SEO du concurrent (même algorithme que la rédaction)">
              <div
                className="font-[family-name:var(--font-mono)] text-[13px] font-semibold"
                style={{
                  color:
                    r.score >= 70 ? "var(--green)" : r.score >= 40 ? "var(--orange)" : "var(--red)",
                }}
              >
                {r.score}
              </div>
              <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
                score
              </div>
            </div>
          )}
          <div>
            <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold">
              {r.wordCount ? r.wordCount : "N/A"}
            </div>
            <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
              mots
            </div>
          </div>
          <div>
            <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold">
              {r.headings ?? "N/A"}
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
          {r.outline && r.outline.length > 0
            ? r.outline.map((h, i) => (
                <HeadingLine
                  key={`o-${i}`}
                  level={(`h${h.level}`) as "h1" | "h2" | "h3"}
                  text={h.text}
                />
              ))
            : (
              <>
                {(r.h1 ?? []).map((h, i) => (
                  <HeadingLine key={`h1-${i}`} level="h1" text={h} />
                ))}
                {(r.h2 ?? []).map((h, i) => (
                  <HeadingLine key={`h2-${i}`} level="h2" text={h} />
                ))}
                {(r.h3 ?? []).map((h, i) => (
                  <HeadingLine key={`h3-${i}`} level="h3" text={h} />
                ))}
              </>
            )}
        </div>
      )}
    </div>
  );
}

function HeadingLine({ level, text }: { level: "h1" | "h2" | "h3"; text: string }) {
  const indent = level === "h1" ? 0 : level === "h2" ? 22 : 44;
  const pillBg =
    level === "h1" ? "var(--bg-olive-light)" : level === "h2" ? "var(--bg-warm)" : "var(--bg-card)";
  const pillColor =
    level === "h1" ? "var(--accent-dark)" : "var(--text-secondary)";
  const fontSize = level === "h1" ? "13px" : level === "h2" ? "12px" : "11px";
  const fontWeight = level === "h1" ? 700 : level === "h2" ? 600 : 500;

  return (
    <div className="flex items-start gap-2 py-[3px] relative" style={{ paddingLeft: indent }}>
      {indent > 0 && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 border-l border-dashed border-[var(--border)]"
          style={{ left: indent - 12 }}
        />
      )}
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

/**
 * Mapping country → BCP 47 pour `lang` du correcteur navigateur. Le brief
 * stocke un code pays (fr, us, uk, de, it, es) qui sert aussi à scoper la
 * SERP. On le réutilise pour aiguiller le spellcheck vers le bon dico.
 */
function spellcheckLang(country: string): string {
  switch (country.toLowerCase()) {
    case "us": return "en-US";
    case "uk":
    case "gb": return "en-GB";
    case "de": return "de-DE";
    case "it": return "it-IT";
    case "es": return "es-ES";
    case "fr":
    default: return "fr-FR";
  }
}
