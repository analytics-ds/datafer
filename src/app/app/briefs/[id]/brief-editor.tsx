"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { buildKeywordRegex, computeDetailedScore, MIN_VALID_COMPETITOR_SCORE, normalize, type DetailedScore, type ParagraphSemanticScore } from "@/lib/scoring";
import {
  extractGeoSignals,
  EMPTY_GEO_SIGNALS,
  GEO_LABELS,
  type GeoSignals,
} from "@/lib/geo-scoring";
import { faviconUrl } from "@/lib/favicon";
import { EditorToolbar } from "./toolbar";
import { MaillageSection } from "./maillage-section";
import { ShareBriefPanel } from "../share-brief-panel";
import { CommentLayer } from "./comment-layer";
import { CommentsTab } from "./comments-tab";
import { useBriefComments } from "./use-brief-comments";
import type { CommentAuthor } from "./comment-layer-types";

// Feature flag : maillage interne masqué côté UI le 2026-05-26 sur demande
// de Pierre (projet en pause). Repasse à `true` pour réafficher la
// MaillageSection sous l'éditeur (consultant + share).
const MAILLAGE_ENABLED = false;
import { CompetitorDownloadMenu } from "./competitor-download-menu";
import { StatusPicker } from "../status-picker";
import { TagPicker, type TagDTO } from "../tag-picker";
import type { WorkflowStatus } from "../workflow-status";
import { ExportMenu } from "./export-menu";
import { BriefSettingsModal } from "./brief-settings-modal";
import { InfoBubble } from "./info-bubble";
import type { BriefOverrides } from "@/lib/brief-overrides";

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
  /**
   * Endpoint POST pour les suggestions de maillage interne.
   * - `/api/briefs/<id>/maillage` côté backoffice
   * - `/api/share-brief/<token>/maillage` côté partage public
   */
  maillageEndpoint?: string;
  /** URL de la page imprimable (PDF via window.print). */
  printUrl?: string;
  /** Masquer le bouton "Nouvelle analyse" (ex. en mode partage). */
  hideNewAnalysis?: boolean;
  /** Token de partage déjà actif sur le brief (mode consultant uniquement). */
  shareToken?: string | null;
  /**
   * Overrides back-office en cours sur le brief. Absent en mode partage :
   * la modal Paramètres ne s'ouvre que pour les users authentifiés.
   */
  overrides?: BriefOverrides;
  /** SERP brute (avant filtre disabledCompetitors) pour piloter la modal. */
  rawSerp?: SerpResult[];
  /** Termes NLP bruts (avant filtre nlpTermsRemoved) pour piloter la modal. */
  rawNlpTerms?: NlpTerm[];
  /**
   * Endpoint REST des commentaires inline (CommentLayer).
   * - `/api/briefs/<id>/comments` côté back-office
   * - `/api/share-brief/<token>/comments` côté partage public
   * Si omis, on dérive depuis `saveEndpoint`.
   */
  commentsEndpoint?: string;
  /**
   * Identité de l'auteur courant pour les commentaires. En back-office, on
   * passe `{ type: "user", name: prénom }`. En share, on passe
   * `{ type: "client", name: "" }` (le client renseignera son prénom au 1er
   * commentaire).
   */
  commentAuthor?: CommentAuthor;
};

type Tab = "editor" | "serp" | "insights" | "comments";

export function BriefEditor(props: BriefEditorProps) {
  const { id, keyword, country, folder, initialHtml, nlp, serp, paa, haloscan, position } = props;
  const saveEndpoint = props.saveEndpoint ?? `/api/briefs/${id}`;
  const tagsEndpoint = props.tagsEndpoint ?? `/api/briefs/${id}/tags`;
  const tagsCreateEndpoint = props.tagsCreateEndpoint ?? `/api/tags`;
  const exportEndpoint = props.exportEndpoint ?? `/api/briefs/${id}/export`;
  const maillageEndpoint = props.maillageEndpoint ?? `/api/briefs/${id}/maillage`;
  const printUrl = props.printUrl ?? `/api/briefs/${id}/print`;
  const commentsEndpoint = props.commentsEndpoint ?? `/api/briefs/${id}/comments`;
  const commentAuthor: CommentAuthor = props.commentAuthor ?? { type: "user", name: "Consultant" };
  const commentsState = useBriefComments(commentsEndpoint, commentAuthor);
  // Indique le mode partage : les UI d'édition (boutons "Insérer" du maillage,
  // etc.) sont en read-only quand on est sur la vue share du client lecteur.
  const isShareMode = !!props.saveEndpoint && props.saveEndpoint.startsWith("/api/share");
  const hideNewAnalysis = props.hideNewAnalysis ?? false;

  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>(props.workflowStatus);
  const [tags, setTags] = useState<TagDTO[]>(props.initialTags);
  // Modal Paramètres back-office (icône ⚙️). Affichée uniquement quand le
  // brief est ouvert depuis la session authentifiée (pas en mode partage).
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const [editorData, setEditorData] = useState({ text: "", h1s: [] as string[], h2s: [] as string[], h3s: [] as string[], imageCount: 0 });
  const [geoSignals, setGeoSignals] = useState<GeoSignals>(EMPTY_GEO_SIGNALS);
  const [currentTag, setCurrentTag] = useState<"h1" | "h2" | "h3" | "p" | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache des scores cosinus paragraphe (clé = hash du textContent), alimenté
  // par le debounce semantic ci-dessous. Sert à : (a) calculer le critère
  // semantic /10 du scoring, (b) appliquer la bordure colorée gauche sur
  // chaque <p> de l'éditeur. Itération 8 (2026-05-08, validée Pierre).
  const [paragraphScores, setParagraphScores] = useState<Map<string, { score: number; color: "green" | "yellow" | "red" }>>(new Map());
  const semanticDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const semanticInflight = useRef<Set<string>>(new Set());

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
    const imageCount = el.querySelectorAll("img").length;
    setEditorData({ text, h1s, h2s, h3s, imageCount });
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

  // Hash très court (200 caractères normalisés) pour identifier un paragraphe
  // sans payer le coût d'un vrai hash. Suffisant pour le cache : si 2 paras
  // ont les mêmes 200 premiers caractères normalisés, leur cosinus sera
  // quasi identique de toute façon.
  const paragraphCacheKey = useCallback((text: string): string => {
    return text.replace(/\s+/g, " ").trim().slice(0, 200);
  }, []);

  // Debounce semantic : 2s après chaque modif éditeur, on récupère les
  // scores cosinus de chaque paragraphe ≥5 mots qui n'est pas encore en
  // cache. Max 5 fetchs par batch pour éviter d'inonder l'endpoint.
  // Désactivé si nlp.semanticCentroid absent (briefs antérieurs à l'iter 8).
  useEffect(() => {
    if (!nlp?.semanticCentroid || nlp.semanticCentroid.length === 0) return;
    if (!editorRef.current) return;
    if (semanticDebounce.current) clearTimeout(semanticDebounce.current);
    semanticDebounce.current = setTimeout(async () => {
      const el = editorRef.current;
      if (!el) return;
      const paragraphs = Array.from(el.querySelectorAll("p"));
      const toFetch: string[] = [];
      for (const p of paragraphs) {
        const text = (p.textContent || "").trim();
        if (text.split(/\s+/).filter(Boolean).length < 5) continue;
        const hash = paragraphCacheKey(text);
        if (paragraphScores.has(hash)) continue;
        if (semanticInflight.current.has(hash)) continue;
        toFetch.push(text);
        if (toFetch.length >= 5) break;
      }
      if (toFetch.length === 0) return;
      for (const t of toFetch) semanticInflight.current.add(paragraphCacheKey(t));
      const newScores = new Map(paragraphScores);
      await Promise.all(
        toFetch.map(async (paragraph) => {
          try {
            const r = await fetch(`/api/v2/briefs/${id}/semantic-paragraph`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paragraph }),
            });
            const j = (await r.json()) as {
              centroidAvailable?: boolean;
              score?: number;
              color?: "green" | "yellow" | "red";
            };
            if (j.centroidAvailable && typeof j.score === "number" && j.color) {
              newScores.set(paragraphCacheKey(paragraph), { score: j.score, color: j.color });
            }
          } catch {
            // Silencieux : un échec ponctuel n'empêche pas l'éditeur de
            // fonctionner ; on retentera au prochain debounce.
          } finally {
            semanticInflight.current.delete(paragraphCacheKey(paragraph));
          }
        }),
      );
      setParagraphScores(newScores);
    }, 2000);
    return () => {
      if (semanticDebounce.current) clearTimeout(semanticDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorData.text, id, nlp?.semanticCentroid, paragraphScores]);

  // Applique la bordure colorée gauche sur chaque <p> en fonction de son
  // score sémantique en cache. Vert > 0.75, jaune 0.55-0.75, rouge < 0.55
  // (seuils validés Pierre 2026-05-06).
  useEffect(() => {
    if (!editorRef.current) return;
    const colorMap = { green: "#10b981", yellow: "#f59e0b", red: "#ef4444" } as const;
    const paragraphs = editorRef.current.querySelectorAll("p");
    for (const p of paragraphs) {
      const text = (p.textContent || "").trim();
      const hash = paragraphCacheKey(text);
      const s = paragraphScores.get(hash);
      const el = p as HTMLElement;
      if (s) {
        el.style.borderLeft = `3px solid ${colorMap[s.color]}`;
        el.style.paddingLeft = "12px";
        el.title = `Proximité sémantique : ${Math.round(s.score * 100)} / 100 (${s.color})`;
      } else {
        el.style.borderLeft = "";
        el.style.paddingLeft = "";
        el.removeAttribute("title");
      }
    }
  }, [paragraphScores, editorData.text, paragraphCacheKey]);

  // Tableau plat des scores sémantiques pour computeDetailedScore. Review
  // 2026-05-08 (M3) : on filtre les scores en croisant avec les paragraphes
  // actuellement présents dans le DOM. Sinon des paragraphes supprimés
  // (mais encore en cache) faussent la moyenne sémantique. Recalculé à
  // chaque modif de editorData.text.
  const semanticParagraphScores = useMemo(() => {
    if (!editorRef.current) return [];
    const liveKeys = new Set<string>();
    for (const p of editorRef.current.querySelectorAll("p")) {
      const text = (p.textContent || "").trim();
      if (text.split(/\s+/).filter(Boolean).length < 5) continue;
      liveKeys.add(paragraphCacheKey(text));
    }
    const out: ParagraphSemanticScore[] = [];
    for (const [key, val] of paragraphScores) {
      if (liveKeys.has(key)) out.push({ score: val.score });
    }
    return out;
    // editorData.text déclenche la re-évaluation à chaque modif éditeur.
  }, [paragraphScores, editorData.text, paragraphCacheKey]);

  const score: DetailedScore = useMemo(
    // Score brut (rawTotal) directement : plus de relativisation vs médiane
    // concurrents (décision 2026-05-16). Le score affiché user est désormais
    // sur la même échelle que le score brut affiché côté SERP concurrents.
    // semanticParagraphScores est alimenté par le debounce ci-dessus.
    () =>
      computeDetailedScore(
        editorData,
        nlp,
        geoSignals,
        undefined,
        semanticParagraphScores.length > 0 ? semanticParagraphScores : undefined,
      ),
    [editorData, nlp, geoSignals, semanticParagraphScores],
  );

  // Premier save : on rattrape les briefs avec un score obsolète en BDD
  // (changement de formule, debounce raté à la session précédente…). On
  // déclenche dès le 1er calcul utile et on ne le rejoue pas.
  //
  // Bug fix 2026-05-26 : on attend que les embeddings paragraphes soient
  // arrivés (paragraphScores non vide) AVANT le premier save, sinon on
  // push un score sous-évalué (sans la composante semantic /10) qui fait
  // diverger l'affichage liste (snapshot BDD) vs affichage brief (calcul
  // live avec embeddings). Pierre voyait 84 dans la liste et 85 dans le
  // brief sur "assurance moto A2" parce que le initial save tirait avant
  // les fetch async des embeddings.
  //
  // Fallback : si après 4s les embeddings ne sont toujours pas arrivés
  // (brief vide, AI binding down, etc.), on save quand même.
  const initialSaveDone = useRef(false);
  const initialSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (initialSaveDone.current) return;
    if (editorData.text.length === 0 && !editorRef.current?.innerHTML) return;

    const hasMeaningfulText = editorData.text.length > 100;
    const embeddingsLoaded = paragraphScores.size > 0;
    const shouldWait = hasMeaningfulText && !embeddingsLoaded;

    if (shouldWait && !initialSaveTimer.current) {
      // Arm le fallback timeout : si après 4s on n'a toujours rien, save
      // quand même pour ne pas bloquer indéfiniment.
      initialSaveTimer.current = setTimeout(() => {
        if (initialSaveDone.current) return;
        initialSaveDone.current = true;
        fetch(saveEndpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: score.total, rawScore: score.rawTotal }),
        }).catch(() => {});
      }, 4000);
      return;
    }
    if (shouldWait) return;

    if (initialSaveTimer.current) {
      clearTimeout(initialSaveTimer.current);
      initialSaveTimer.current = null;
    }
    initialSaveDone.current = true;
    fetch(saveEndpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: score.total, rawScore: score.rawTotal }),
    }).catch(() => {
      // best-effort : si ça échoue, le debounce save reprendra plus tard.
    });
  }, [editorData.text, score.total, score.rawTotal, saveEndpoint, paragraphScores.size]);

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
            rawScore: score.rawTotal,
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
  }, [editorData, score.total, score.rawTotal, saveEndpoint]);

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

  const handleInsertImage = (src: string, alt: string) => {
    if (!src) return;
    editorRef.current?.focus();
    const safeAlt = escapeHtml(alt);
    const safeSrc = escapeHtml(src);
    document.execCommand(
      "insertHTML",
      false,
      `<img src="${safeSrc}" alt="${safeAlt}" style="max-width:100%;height:auto" />`,
    );
    readEditor();
  };

  const handleInsertLink = () => {
    const url = window.prompt("URL du lien :");
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    readEditor();
  };

  // Récupère l'HTML courant pour le passer au moteur de suggestions maillage.
  const getEditorHtml = useCallback(() => editorRef.current?.innerHTML ?? "", []);

  // Insère le lien suggéré par le moteur de maillage : trouve le n-ième <p>
  // de l'éditeur, wrap la première occurrence du texte d'ancre dans un <a>.
  // Garantie : on n'écrit jamais dans un heading (h1/h2/h3) car le moteur
  // de suggestions ne retourne que des paragraphIndex pointant sur des <p>.
  const handleInsertMaillageLink = useCallback(
    (paragraphIndex: number, anchor: string, url: string): boolean => {
      const el = editorRef.current;
      if (!el) return false;
      const ps = el.querySelectorAll("p");
      if (paragraphIndex < 0 || paragraphIndex >= ps.length) return false;
      const p = ps[paragraphIndex];
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode() as Text | null;
      while (textNode) {
        const text = textNode.textContent ?? "";
        const idx = text.indexOf(anchor);
        if (idx !== -1) {
          const before = text.slice(0, idx);
          const after = text.slice(idx + anchor.length);
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = anchor;
          const parent = textNode.parentNode!;
          if (before) parent.insertBefore(document.createTextNode(before), textNode);
          parent.insertBefore(a, textNode);
          if (after) parent.insertBefore(document.createTextNode(after), textNode);
          parent.removeChild(textNode);
          readEditor();
          // Save immédiat car l'autosave debouncé watch innerText qui n'a
          // pas changé : seul le innerHTML a changé (ajout d'une balise <a>).
          fetch(saveEndpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ editorHtml: el.innerHTML }),
          }).catch(() => {});
          return true;
        }
        textNode = walker.nextNode() as Text | null;
      }
      return false;
    },
    [readEditor, saveEndpoint],
  );

  const handleInsertTable = (rows: number, cols: number) => {
    const safeRows = Math.min(20, Math.max(1, rows));
    const safeCols = Math.min(10, Math.max(1, cols));
    const rowCells = (cells: string) =>
      `<tr>${Array.from({ length: safeCols }).map(() => cells).join("")}</tr>`;
    const html =
      `<table><thead>${rowCells("<th><br></th>")}</thead><tbody>${Array.from({ length: safeRows - 1 })
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
      <div className="flex items-center justify-between gap-3 px-7 py-4 bg-[var(--bg-card)] border-b border-[var(--border)] flex-wrap">
        <div className="flex items-center gap-[12px]">
          <h2 className="font-[family-name:var(--font-display)] text-[24px] tracking-[-0.6px] font-semibold leading-none">
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
          {/* Indicateur de save : on n'affiche QUE l'état "saving" (silencieux par défaut).
              Le flash "✓ Enregistré" était trop fréquent (toutes les 2s pendant la
              rédaction), demande Pierre 2026-05-28. Si un save échoue, on pourrait
              afficher un état "erreur" plus tard. */}
          {saveStatus === "saving" && <span className="text-[11px] text-[var(--text-muted)]">Enregistrement…</span>}
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
          {!hideNewAnalysis && (
            <button
              onClick={() => setSettingsOpen(true)}
              title="Paramètres du brief"
              aria-label="Paramètres du brief"
              className="ml-1 inline-flex items-center justify-center w-[38px] h-[38px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-warm)] hover:text-[var(--text)] transition-colors"
            >
              <SettingsGearIcon />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-[2px] px-7 bg-[var(--bg-card)] border-b border-[var(--border)]">
        <TabButton active={tab === "editor"} onClick={() => setTab("editor")}>
          Éditeur
        </TabButton>
        <TabButton active={tab === "serp"} onClick={() => setTab("serp")} count={serp.length}>
          SERP
        </TabButton>
        <TabButton active={tab === "insights"} onClick={() => setTab("insights")}>
          Insights
        </TabButton>
        <TabButton
          active={tab === "comments"}
          onClick={() => setTab("comments")}
          count={commentsState.comments.filter((c) => !c.parentId && !c.resolvedAt).length || undefined}
        >
          Commentaires
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
            <CommentLayer
              editorRef={editorRef}
              saveEditorHtml={readEditor}
              author={commentAuthor}
              comments={commentsState.comments}
              active={tab === "editor"}
              create={commentsState.create}
              patch={commentsState.patch}
              remove={commentsState.remove}
            />

            {/* Feature maillage interne mise de côté 2026-05-26. Le code
                reste en place pour réactivation via MAILLAGE_ENABLED. */}
            {MAILLAGE_ENABLED && (
              <MaillageSection
                endpoint={maillageEndpoint}
                getEditorHtml={getEditorHtml}
                onInsertLink={handleInsertMaillageLink}
                readOnly={isShareMode}
              />
            )}
          </div>

          {/* Sidebar */}
          <EditorSidebar
            briefId={id}
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
                    buildKeywordRegex(nlp.exactKeyword.keyword).test(normalize(h)),
                  )
                : false
            }
            editorH2s={editorData.h2s}
            editorH3s={editorData.h3s}
            editorImageCount={editorData.imageCount}
            insertTermAtCursor={insertTermAtCursor}
            insertPaaAsH2={insertPaaAsH2}
          />
      </div>

      <div className={tab === "serp" ? "flex-1 overflow-y-auto px-7 py-6" : "hidden"}>
        <div className="grid gap-2 max-w-[880px]">
          {serp.map((r) => (
            <SerpCard key={r.position} r={r} briefId={id} />
          ))}
        </div>
        <SerpScoreChart serp={serp} myScore={score.total} className="mt-6 max-w-[880px]" />
      </div>

      <div className={tab === "insights" ? "flex-1 overflow-y-auto px-7 py-6" : "hidden"}>
        <InsightsPane
          nlp={nlp}
          halo={halo}
          serp={serp}
          paa={paa}
          userScore={score.total}
          userSeoScore={score.seoTotal}
          userWordCount={wc}
          userH2Count={editorData.h2s.length}
          userH3Count={editorData.h3s.length}
        />
      </div>

      <div className={tab === "comments" ? "flex-1 overflow-y-auto" : "hidden"}>
        <CommentsTab
          comments={commentsState.comments}
          author={commentAuthor}
          editorRef={editorRef}
          patch={commentsState.patch}
          remove={commentsState.remove}
          reply={(input) =>
            commentsState.create({
              anchorId: input.anchorId,
              anchorText: input.anchorText,
              body: input.body,
              parentId: input.parentId,
            })
          }
          onJumpToAnchor={(anchorId) => {
            setTab("editor");
            // Laisse le DOM monter avant de scroller.
            setTimeout(() => {
              const span = editorRef.current?.querySelector<HTMLSpanElement>(
                `span.df-comment-anchor[data-comment-id="${anchorId.replace(/"/g, '\\"')}"]`,
              );
              if (span) {
                span.scrollIntoView({ block: "center", behavior: "smooth" });
                span.classList.add("df-comment-anchor-active");
                setTimeout(() => span.classList.remove("df-comment-anchor-active"), 1600);
              }
            }, 50);
          }}
        />
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
        .rich-editor ul, .rich-editor ol { margin: 8px 0 12px 24px; padding-left: 0; }
        .rich-editor ul { list-style: disc outside; }
        .rich-editor ol { list-style: decimal outside; }
        .rich-editor li { margin-bottom: 4px; }
        .rich-editor li::marker { color: var(--text-muted); }
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
      {!hideNewAnalysis && (
        <BriefSettingsModal
          briefId={id}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          currentPosition={position}
          rawAvgWordCount={nlp?.avgWordCount ?? 0}
          rawMinWordCount={nlp?.minWordCount ?? 0}
          rawMaxWordCount={nlp?.maxWordCount ?? 0}
          rawSerp={props.rawSerp ?? serp}
          rawNlpTerms={props.rawNlpTerms ?? nlp?.nlpTerms ?? []}
          current={props.overrides ?? {}}
        />
      )}
    </div>
  );
}

function ScoreInfoTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Comment est calculé le score SEO ?"
        className="ml-1 inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border border-[var(--border-strong)] text-[10px] font-bold text-[var(--text-muted)] align-middle leading-none hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        ?
      </button>
      {open && typeof document !== "undefined" &&
        createPortal(<ScoreInfoModal onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ScoreInfoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const criteres = [
    { name: "Couverture sémantique (NLP)", pts: 27, hint: "Présence des termes essentiels et importants vus chez les top 10 concurrents" },
    { name: "Mot-clé principal", pts: 15, hint: "Couverture des tokens + bonus correspondance exacte" },
    { name: "Titres (H1/H2/H3)", pts: 13, hint: "H1 unique, KW dans H1, nombre de H2, KW dans H2, au moins 2 H3" },
    { name: "Placement du mot-clé", pts: 13, hint: "KW dans les 100 premiers mots, 1re phrase, 100 derniers mots, distribution" },
    { name: "Sémantique paragraphe (IA)", pts: 10, hint: "Cosinus moyen de tes paragraphes vs centroïde sémantique top 10 (embeddings bge-m3)" },
    { name: "Longueur de contenu", pts: 7, hint: "wc dans la fourchette concurrents, ±20 % de la moyenne, au-dessus de la moyenne" },
    { name: "Structure", pts: 6, hint: "Ratio paragraphes, longueur des paragraphes, contenu ≥ 500 mots" },
    { name: "Qualité rédactionnelle", pts: 5, hint: "Longueur moyenne des phrases, densité du KW, diversité lexicale ≥ 0,55" },
    { name: "Images", pts: 4, hint: "Nombre d'images aligné sur la médiane des concurrents" },
  ];
  const maxPts = Math.max(...criteres.map((c) => c.pts));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow-lg)] max-w-[560px] w-full max-h-[85vh] overflow-y-auto p-7 pt-9 relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)]"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <h3 className="font-[family-name:var(--font-display)] text-[20px] mb-3">Comment est calculé le score ?</h3>
        <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)] mb-5">
          Le score RankShaker est <strong>calibré sur tes concurrents</strong> du top 10 Google.
          La médiane des scores bruts concurrents = 50, médiane × 1,5 = 100. Sur les requêtes
          à concurrence faible, on remonte la médiane à 60 pour rester ambitieux. Ce n&apos;est
          pas une note absolue : un score de 70 signifie que ton contenu fait ~40 % de mieux
          que la médiane des concurrents qui rankent déjà.
        </p>
        <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-3">
          Pondération SEO (92 % du score total)
        </div>
        <ul className="text-[12px] space-y-[8px] mb-5">
          {criteres.map((c) => (
            <li key={c.name} className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] leading-[1.4]">{c.hint}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-[2px]">
                <div className="w-[80px] h-[5px] bg-[var(--bg-warm)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${(c.pts / maxPts) * 100}%` }}
                  />
                </div>
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-secondary)] w-[24px] text-right">
                  {c.pts}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="text-[12px] leading-[1.55] text-[var(--text-secondary)] bg-[var(--bg-warm)] rounded-[var(--radius-xs)] p-3 border border-[var(--border)]">
          <strong className="text-[var(--text)]">Signaux GEO (8 % du score)</strong> : citations,
          listes, FAQ, schémas et autres marqueurs qui aident à apparaître dans les réponses
          générées par ChatGPT, Perplexity et Google AI Overviews.
        </div>
      </div>
    </div>
  );
}

const NLP_JUNK_TOKENS = new Set([
  "est", "ce", "qui", "que", "quoi", "qu", "où", "quand",
  "comment", "pourquoi", "combien",
  "quel", "quelle", "quels", "quelles",
  "quelque", "quelques", "quelconque", "quelconques",
  "lequel", "laquelle", "lesquels", "lesquelles",
  "le", "la", "les", "un", "une", "des", "du", "de", "en", "et", "ou",
  "à", "au", "aux", "pour", "par", "sur", "sous", "dans", "avec", "sans",
  "plus", "moins", "très", "tout", "tous", "toute", "toutes",
  "bien", "mieux", "aussi", "encore", "déjà", "même", "non", "oui",
  "fait", "faire", "peut", "peuvent", "sont", "etre", "avoir",
  "n", "s", "d", "l", "j", "t", "m", "c",
]);

function isJunkNlpTerm(term: string, targetKeyword?: string | null): boolean {
  const tokens = normalize(term)
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const kwTokens = new Set<string>();
  if (targetKeyword) {
    normalize(targetKeyword)
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .forEach((w) => {
        kwTokens.add(w);
        if (w.endsWith("s")) kwTokens.add(w.slice(0, -1));
        else kwTokens.add(w + "s");
      });
  }

  return tokens.every((t) => NLP_JUNK_TOKENS.has(t) || kwTokens.has(t));
}

function EditorSidebar({
  briefId,
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
  editorImageCount,
  insertTermAtCursor,
  insertPaaAsH2,
}: {
  briefId: string;
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
  editorImageCount: number;
  insertTermAtCursor: (t: string) => void;
  insertPaaAsH2: (q: string) => void;
}) {
  // normalize() = lowercase + strip accents + flatten ligatures. Indispensable
  // côté chips NLP : "première" et "premiere" doivent matcher pareil.
  const lower = normalize(editorText);

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
      tip: score.quality.score < 4 ? "↑ Variez le vocabulaire et la longueur des phrases" : "✓ Bonne qualité rédactionnelle" },
    { label: "Images", s: score.images, color: "var(--blue)",
      tip: (() => {
        const target = Number(score.images.details.target ?? 0);
        const count = Number(score.images.details.count ?? 0);
        if (target === 0) return "Aucune image attendue (concurrents sans visuels)";
        if (count >= target) return `✓ ${count} image${count > 1 ? "s" : ""} dans le contenu (cible : ${target})`;
        return `↑ Ajoutez ${target - count} image${(target - count) > 1 ? "s" : ""} (cible médiane concurrents : ${target})`;
      })() },
    { label: "GEO (LLMs)", s: { score: score.geo.total, max: 100, details: {} }, color: "var(--purple)",
      tip: score.geo.total < 60
        ? "↑ Ajoutez tableau / FAQ / liste / résumé / chiffre pour citation IA"
        : "✓ Bons signaux GEO" },
    // Sémantique paragraphe (itération 8) : critère neutralisé (max=0) si
    // brief antérieur ou si le debounce live n'a pas encore scoré les paras.
    ...(score.semantic.max > 0
      ? [{
          label: "Sémantique Google", s: score.semantic, color: "var(--accent)",
          tip: (() => {
            const avg = Number(score.semantic.details.avgCosine ?? 0);
            const n = Number(score.semantic.details.paragraphsScored ?? 0);
            if (avg >= 0.75) return `✓ Excellente proximité sémantique (${n} paragraphes, cosinus moyen ${avg.toFixed(2)})`;
            if (avg >= 0.55) return `↑ Bonne proximité (${avg.toFixed(2)}). Renforcez les paragraphes en jaune/rouge`;
            return `↑ Proximité sémantique faible (${avg.toFixed(2)}). Recentrez le contenu sur le sujet du KW`;
          })(),
        }]
      : []),
  ];

  const essential: NlpTerm[] = [];
  const important: NlpTerm[] = [];
  const opportunity: NlpTerm[] = [];
  (nlp?.nlpTerms ?? [])
    .slice(0, 40)
    .filter((k) => !isJunkNlpTerm(k.term, nlp?.exactKeyword?.keyword))
    .forEach((k) => {
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
    kwCount = (normalize(lower).match(buildKeywordRegex(ek.keyword)) ?? []).length;
    density = wc > 0 ? Math.round(((kwCount * ek.keyword.split(/\s+/).length) / wc) * 10000) / 100 : 0;
    const intro = editorText.trim().split(/\s+/).slice(0, 100).join(" ");
    inIntro = buildKeywordRegex(ek.keyword).test(normalize(intro));
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
          <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] inline-flex items-center">
            Score SEO
            <ScoreInfoTrigger />
          </span>
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
      <Section
        title="Score détaillé"
        dotColor="var(--bg-black)"
        info="Décomposition du score SEO en 9 critères pondérés sur 100. Chaque barre indique ta progression sur le critère (vert ≥70%, orange 40-69%, rouge <40%). La somme pondérée donne le score affiché en haut."
      >
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
        <Section
          title="Mot-clé exact (densité)"
          dotColor="var(--accent)"
          info="Densité = (occurrences × longueur du KW) / nombre total de mots × 100. La fourchette idéale est calculée d'après les concurrents top 10. Trop bas = mot-clé sous-représenté, trop haut = bourrage (risque de pénalité Google)."
        >
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
        <Section
          title="Champ sémantique"
          dotColor="var(--purple)"
          defaultOpen
          info="Termes que les concurrents top 10 utilisent fréquemment sur ce KW. Plus la présence est haute, plus le terme est attendu par Google. 3 tiers : Essentiels (≥70%), Importants (40-69%), Opportunités (<40%)."
          headerAction={
            <CopyTermsButton
              terms={[
                ...(nlp.keywordTerms ?? []).filter((k) => k.kind === "exact").map((k) => k.term),
                ...essential.map((t) => t.term),
                ...important.map((t) => t.term),
                ...opportunity.map((t) => t.term),
              ]}
            />
          }
        >
          <TierTags
            label="Essentiels"
            color="var(--red)" bg="#FFF0F0" border="#E8BCBC"
            terms={essential}
            kwTerms={(nlp.keywordTerms ?? []).filter((k) => k.kind === "exact")}
            lower={lower}
            onInsert={insertTermAtCursor}
            info="Le mot-clé principal du brief + les termes présents chez ≥70% des concurrents top 10. Considérés comme obligatoires : tu dois tous les couvrir pour avoir le score NLP max (17/27 pts)."
          />
          <TierTags
            label="Importants"
            color="var(--orange)" bg="var(--orange-bg)" border="#E8D6A0"
            terms={important} lower={lower} onInsert={insertTermAtCursor}
            info="Termes présents chez 40-69% des concurrents. Pas obligatoires mais fortement attendus. Couvrir le maximum donne jusqu'à 10/27 pts de NLP."
          />
          <TierTags
            label="Opportunité"
            color="var(--blue)" bg="var(--blue-bg)" border="#B8D0E8"
            terms={opportunity} lower={lower} onInsert={insertTermAtCursor}
            info="Termes présents chez moins de 40% des concurrents. Ignorés du scoring (zéro pénalité). À ajouter en bonus si pertinent pour différencier ton contenu."
          />
        </Section>
      )}

      {nlp?.semanticClusters && nlp.semanticClusters.length > 0 && (
        <Section title="Clusters thématiques (IA)" dotColor="var(--blue)">
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
                  <span
                    key={t}
                    className="inline-flex items-center px-[7px] py-[2px] rounded-full text-[10px] bg-[var(--bg-warm)] border border-[var(--border)]"
                  >
                    {t}
                  </span>
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
        <Section
          title="People Also Ask"
          dotColor="var(--blue)"
          info="Questions affichées par Google dans le bloc 'Autres questions posées' sur ce KW. Couvrir ces questions dans tes H2 améliore la pertinence et peut déclencher un rich snippet."
        >
          <PaaCoverageList paa={paa} editorText={editorText} keyword={ek?.keyword ?? ""} onInsert={insertPaaAsH2} />
        </Section>
      )}

      {nlp && (
        <Section
          title="Benchmarks SERP"
          dotColor="var(--green)"
          info="Statistiques calculées sur les 10 premières pages Google (concurrents). Sert de référence pour calibrer ton contenu : viser dans la fourchette est généralement bon, viser la moyenne est sûr."
        >
          <BenchRow label="Plage de mots" value={`${nlp.minWordCount} à ${nlp.maxWordCount}`} />
          <BenchRow label="Moyenne" value={String(nlp.avgWordCount)} />
          <BenchRow label="Titres" value={String(nlp.avgHeadings)} />
          <BenchRow label="Paragraphes" value={String(nlp.avgParagraphs)} />
          <BenchRow
            label="Images recommandées"
            value={`${editorImageCount}/${nlp.medianImages ?? 0}`}
            last
          />
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
                    <div
                      key={r.position}
                      className="group flex items-center gap-2 py-[3px] text-[11px] hover:bg-[var(--bg-warm)] rounded-[var(--radius-xs)] px-1 -mx-1"
                    >
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 flex-1 min-w-0"
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
                      {wc > 0 && (
                        <CompetitorDownloadMenu briefId={briefId} position={r.position} />
                      )}
                    </div>
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
  defaultOpen = false,
  info,
  headerAction,
  children,
}: {
  title: string;
  dotColor: string;
  defaultOpen?: boolean;
  /** Tooltip d'aide affiché via une bulle "i" à côté du titre. */
  info?: string;
  /** Élément cliquable affiché à droite du titre (ex : bouton "Copier").
   * Doit gérer son propre `e.stopPropagation()` pour ne pas toggle la section. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="w-full flex items-center justify-between gap-[6px] text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-[10px] hover:text-[var(--text)] transition-colors cursor-pointer select-none"
      >
        <span className="flex items-center gap-[6px]">
          <span className="w-[6px] h-[6px] rounded-full" style={{ background: dotColor }} />
          {title}
          {info && <InfoBubble text={info} />}
        </span>
        <span className="flex items-center gap-[8px]">
          {headerAction}
          <svg
            width="10"
            height="10"
            viewBox="0 0 20 20"
            fill="none"
            className="transition-transform shrink-0"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {open && children}
    </div>
  );
}

// Bouton de copie compact à insérer dans le header d'une Section. Stoppe la
// propagation du click pour ne pas déclencher le toggle de la Section parent.
function CopyTermsButton({ terms }: { terms: string[] }) {
  const [copied, setCopied] = useState(false);
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (terms.length === 0) return;
    const text = terms.join(", ");
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          handleClick(e as unknown as React.MouseEvent);
        }
      }}
      title={copied ? "Copié" : `Copier les ${terms.length} mots-clés`}
      className="inline-flex items-center gap-[3px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-[6px] py-[2px] text-[9px] font-semibold normal-case tracking-normal text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)] transition-colors"
    >
      {copied ? (
        <>
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copié
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden>
            <rect x="6" y="6" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M4 14V5a1 1 0 0 1 1-1h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
          Copier
        </>
      )}
    </span>
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
  const userHeadings = [...editorH2s, ...editorH3s].map((h) => normalize(h));
  // Une section est couverte si au moins un key term (ou sa forme) apparaît
  // dans un H2/H3 de l'utilisateur. normalize() des deux côtés pour matcher
  // accent-insensible.
  const coverage = sections.map((s) => {
    const covered = s.keyTerms.some((t) =>
      userHeadings.some((h) => h.includes(normalize(t))),
    );
    return { section: s, covered };
  });
  const coveredCount = coverage.filter((c) => c.covered).length;
  // Non couvertes en premier (priorité d'action). Array.sort est stable,
  // donc l'ordre par hits décroissants est préservé dans chaque groupe.
  const sorted = [...coverage].sort(
    (a, b) => Number(a.covered) - Number(b.covered),
  );
  return (
    <div>
      <div className="text-[11px] text-[var(--text-muted)] mb-[8px]">
        <span className="font-semibold text-[var(--text)]">{coveredCount}/{sections.length}</span> sections couvertes. Cliquer pour insérer comme H2.
      </div>
      <div className="flex flex-col gap-1">
        {sorted.map(({ section, covered }) => {
          const titleCase =
            section.label.charAt(0).toUpperCase() + section.label.slice(1);
          const suggestedHeading = section.sampleHeadings[0] ?? titleCase;
          const pct =
            section.total > 0
              ? Math.round((section.hits / section.total) * 100)
              : 0;
          const examples = section.sampleHeadings.slice(0, 2);
          return (
            <button
              key={section.label}
              onClick={() => onInsert(suggestedHeading)}
              title={`Exemples concurrents : ${section.sampleHeadings.slice(0, 3).join(" · ")}`}
              className="group flex flex-col gap-1 px-[10px] py-[7px] bg-[var(--bg-card)] border rounded-[var(--radius-xs)] text-left text-[12px] leading-[1.4] hover:bg-[var(--bg-olive-light)] transition-colors"
              style={{
                borderColor: covered ? "var(--green)" : "var(--border)",
                background: covered ? "var(--green-bg)" : undefined,
              }}
            >
              <span className="flex items-center gap-2 w-full">
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
                <span
                  className="text-[9px] font-[family-name:var(--font-mono)] shrink-0"
                  style={{ color: covered ? "var(--text-muted)" : "var(--orange)" }}
                  title={`${section.hits}/${section.total} concurrents traitent ce sous-sujet`}
                >
                  {pct}%
                </span>
                <span className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.5px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  → H2
                </span>
              </span>
              {!covered && examples.length > 0 && (
                <span className="pl-[22px] text-[10px] text-[var(--text-muted)] leading-[1.45] italic">
                  {examples.join("  ·  ")}
                </span>
              )}
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
  const lower = normalize(editorText);
  const rows = entities.map((e) => ({
    entity: e,
    mentioned: lower.includes(normalize(e.label)),
  }));
  const mentioned = rows.filter((r) => r.mentioned).length;
  return (
    <div>
      <div className="text-[11px] text-[var(--text-muted)] mb-[8px]">
        <span className="font-semibold text-[var(--text)]">{mentioned}/{entities.length}</span> entités citées. Marques, organismes et acronymes vus chez les concurrents.
      </div>
      <div className="flex flex-wrap gap-[5px]">
        {rows.map(({ entity, mentioned }) => (
          <span
            key={entity.label}
            title={`Cité par ${entity.hits}/${entity.total} concurrents (${entity.totalOccurrences} occurrences)`}
            className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[11px] font-medium border"
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
          </span>
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
  normalize(keyword)
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .forEach((w) => {
      kwTokens.add(w);
      if (w.endsWith("s")) kwTokens.add(w.slice(0, -1));
      else kwTokens.add(w + "s");
    });
  const lower = normalize(editorText);
  const rows = paa.slice(0, 5).map((q) => {
    const tokens = normalize(q.question)
      .replace(/[^a-z0-9\s'-]/g, " ")
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

function TierTags({ label, color, bg, border, terms, lower, onInsert, info, kwTerms }: {
  label: string; color: string; bg: string; border: string; terms: NlpTerm[]; lower: string; onInsert: (t: string) => void;
  info?: string;
  /** Mots-clés principaux à afficher en tête, avec leur styling propre
      (chip noir pour exact, chip kaki/bleu pour part/extension). */
  kwTerms?: KeywordTerm[];
}) {
  if (!terms.length && !(kwTerms?.length ?? 0)) return null;
  // Un terme est "utilisé" si sa forme affichée OU l'une de ses variantes
  // morphologiques apparaît dans le contenu. normalize() des deux côtés pour
  // que "première" matche "premiere" (accent-insensible, comme Google).
  const used = terms.filter((k) => {
    if (k.variants && k.variants.length > 0) {
      return k.variants.some((v) => lower.includes(normalize(v)));
    }
    return lower.includes(normalize(k.term));
  }).length;
  const kwUsed = (kwTerms ?? []).filter((k) => {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(
      `(?:^|[^a-z0-9])${escape(normalize(k.term))}(?=$|[^a-z0-9])`,
      "gi",
    );
    return (lower.match(rx) ?? []).length > 0;
  }).length;
  const totalUsed = used + kwUsed;
  const totalCount = terms.length + (kwTerms?.length ?? 0);
  return (
    <div className="mb-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.8px] mb-[6px] flex items-center gap-[5px]" style={{ color }}>
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
        {label}
        <span className="font-[family-name:var(--font-mono)] font-normal text-[var(--text-muted)]">
          {totalUsed}/{totalCount}
        </span>
        {info && <InfoBubble text={info} />}
      </div>
      <div className="flex flex-wrap gap-[5px]">
        {(kwTerms ?? []).map((k) => {
          const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const rx = new RegExp(
            `(?:^|[^a-z0-9])${escape(normalize(k.term))}(?=$|[^a-z0-9])`,
            "gi",
          );
          const currentCount = (lower.match(rx) ?? []).length;
          const hasRange = k.maxCount > 0;
          const rangeLabel = hasRange
            ? k.minCount === k.maxCount
              ? String(k.maxCount)
              : `${k.minCount}-${k.maxCount}`
            : null;
          const inRange = hasRange && currentCount >= k.minCount && currentCount <= k.maxCount;
          const overRange = hasRange && currentCount > k.maxCount;
          const tone = currentCount === 0 ? "missing" : inRange ? "good" : overRange ? "over" : "low";
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
            <span
              key={`kw-${k.term}`}
              title={
                k.kind === "extension"
                  ? `Extension détectée chez ${k.presence}% des concurrents`
                  : k.kind === "exact"
                    ? "Mot-clé principal"
                    : "Sous-partie du mot-clé"
              }
              className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-full text-[12px] font-medium border"
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
            </span>
          );
        })}
        {terms.map((k) => {
          // Compte des occurrences actuelles dans l'éditeur. Pour les
          // unigrammes on matche toutes les variantes morphologiques (stemming)
          // afin que "travaille", "travaillé", "travaux" comptent tous pour le
          // chip "travaux". Pattern normalisé (accents strippés) pour matcher
          // `lower` qui l'est aussi.
          const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const pattern =
            k.variants && k.variants.length > 0
              ? k.variants.map((v) => escape(normalize(v))).join("|")
              : escape(normalize(k.term));
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
            <KeywordChip
              key={k.term}
              term={k.term}
              variants={k.variants}
              sentences={k.sentences}
              style={style}
              onInsert={onInsert}
              currentCount={currentCount}
              rangeLabel={rangeLabel}
              hasTarget={hasTarget}
              minCount={k.minCount}
              maxCount={k.maxCount}
              avgCount={k.avgCount}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Popover citations NLP au survol d'un chip ───────────────────────────
type Citation = { url: string; sentence: string };

function normalizeCitations(
  raw: NlpTerm["sentences"] | string[] | undefined,
): Citation[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((s) =>
    typeof s === "string" ? { url: "", sentence: s } : s,
  );
}

function hostFromUrl(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Surligne le terme (et ses variantes morpho) dans la phrase. Match en
// frontière de mot pour éviter les sous-chaînes parasites ("test" ne doit
// pas surligner "test" à l'intérieur de "testeur").
function highlightTerm(
  sentence: string,
  patterns: string[],
): React.ReactNode {
  if (patterns.length === 0) return sentence;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = patterns
    .map((p) => p.toLowerCase().trim())
    .filter((p) => p.length > 0);
  if (cleaned.length === 0) return sentence;
  let rx: RegExp;
  try {
    rx = new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${cleaned.map(escape).join("|")})(?![\\p{L}\\p{N}])`,
      "giu",
    );
  } catch {
    return sentence;
  }
  type Range = { start: number; end: number };
  const ranges: Range[] = [];
  for (const m of sentence.matchAll(rx)) {
    if (m.index == null) continue;
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  if (ranges.length === 0) return sentence;
  ranges.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  const out: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((r, i) => {
    if (cursor < r.start) out.push(sentence.slice(cursor, r.start));
    out.push(
      <mark
        key={i}
        className="bg-[var(--orange-bg)] text-[var(--text)] font-semibold rounded-[2px] px-[2px]"
      >
        {sentence.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < sentence.length) out.push(sentence.slice(cursor));
  return out;
}

// Chip d'un terme NLP : clic = insertion dans l'éditeur, hover = popover qui
// liste les citations chez les concurrents (URL + phrase) avec navigation
// prev / next. Le popover est rendu en portail pour ne pas être tronqué par
// l'overflow du sidebar. Délai 280 ms à l'ouverture pour éviter le flicker
// quand la souris traverse plusieurs chips.
function KeywordChip({
  term,
  variants,
  sentences,
  style,
  onInsert,
  currentCount,
  rangeLabel,
  hasTarget,
  minCount,
  maxCount,
  avgCount,
}: {
  term: string;
  variants?: string[];
  sentences?: NlpTerm["sentences"];
  style: React.CSSProperties;
  onInsert: (term: string) => void;
  currentCount: number;
  rangeLabel: string | null;
  hasTarget: boolean;
  minCount: number;
  maxCount: number;
  avgCount: number;
}) {
  const cites = useMemo(() => normalizeCitations(sentences), [sentences]);
  const hasCites = cites.length > 0;
  const matchPatterns = useMemo(
    () =>
      term.includes(" ")
        ? [term]
        : [term, ...((variants ?? []).filter((v) => v && v !== term))],
    [term, variants],
  );

  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const cancelOpen = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    cancelOpen();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  if (!hasCites) {
    return (
      <span
        className="inline-flex items-center gap-[5px] px-[10px] py-[4px] rounded-full text-[11px] font-medium border"
        style={style}
      >
        {term}
        {rangeLabel && (
          <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
            {currentCount > 0 ? `${currentCount}/${rangeLabel}` : rangeLabel}
            {hasTarget && minCount !== maxCount && (
              <span className="opacity-60"> (~{avgCount})</span>
            )}
          </span>
        )}
        {!rangeLabel && currentCount > 0 && (
          <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
            {currentCount}
          </span>
        )}
      </span>
    );
  }

  const onEnter = () => {
    cancelClose();
    cancelOpen();
    openTimer.current = setTimeout(() => {
      if (btnRef.current) {
        setAnchorRect(btnRef.current.getBoundingClientRect());
      }
      setIdx(0);
      setOpen(true);
    }, 280);
  };

  const cite = cites[idx] ?? cites[0];
  const host = hostFromUrl(cite.url);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onMouseEnter={onEnter}
        onMouseLeave={scheduleClose}
        onFocus={onEnter}
        onBlur={scheduleClose}
        aria-label={`Voir les citations concurrentes pour ${term}`}
        className="inline-flex items-center gap-[5px] px-[10px] py-[4px] rounded-full text-[11px] font-medium border hover:scale-[1.03] transition-transform"
        style={style}
      >
        {term}
        {rangeLabel && (
          <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
            {currentCount > 0 ? `${currentCount}/${rangeLabel}` : rangeLabel}
            {hasTarget && minCount !== maxCount && (
              <span className="opacity-60"> (~{avgCount})</span>
            )}
          </span>
        )}
        {!rangeLabel && currentCount > 0 && (
          <span className="text-[9px] font-[family-name:var(--font-mono)] font-normal opacity-80">
            {currentCount}
          </span>
        )}
      </button>
      {open && anchorRect && typeof document !== "undefined" &&
        createPortal(
          <CitationPopover
            anchorRect={anchorRect}
            cite={cite}
            host={host}
            idx={idx}
            total={cites.length}
            term={term}
            patterns={matchPatterns}
            onPrev={() =>
              setIdx((i) => (i - 1 + cites.length) % cites.length)
            }
            onNext={() => setIdx((i) => (i + 1) % cites.length)}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          />,
          document.body,
        )}
    </>
  );
}

function CitationPopover({
  anchorRect,
  cite,
  host,
  idx,
  total,
  term,
  patterns,
  onPrev,
  onNext,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRect: DOMRect;
  cite: Citation;
  host: string;
  idx: number;
  total: number;
  term: string;
  patterns: string[];
  onPrev: () => void;
  onNext: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const POPOVER_W = 340;
  const margin = 8;
  const vw =
    typeof window !== "undefined" ? window.innerWidth : POPOVER_W + 2 * margin;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let left = anchorRect.left;
  if (left + POPOVER_W + margin > vw) left = vw - POPOVER_W - margin;
  if (left < margin) left = margin;
  const spaceBelow = vh - anchorRect.bottom;
  const placeBelow = spaceBelow > 180 || spaceBelow >= anchorRect.top;
  const top = placeBelow ? anchorRect.bottom + 6 : Math.max(margin, anchorRect.top - 6);
  const transform = placeBelow ? undefined : "translateY(-100%)";

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 rounded-[var(--radius-sm)] bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-lg text-[12px] leading-[1.5]"
      style={{ top, left, width: POPOVER_W, transform }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-[7px] border-b border-[var(--border)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[var(--text-muted)]">
          « {term} » chez les concurrents
        </div>
        <div className="text-[10px] font-[family-name:var(--font-mono)] text-[var(--text-muted)]">
          {idx + 1}/{total}
        </div>
      </div>
      <div className="px-3 py-[10px]">
        {host ? (
          <a
            href={cite.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block text-[11px] font-semibold text-[var(--accent)] hover:underline truncate mb-[6px]"
            title={cite.url}
          >
            {host}
          </a>
        ) : (
          <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-[6px]">
            Source non disponible
          </div>
        )}
        <div className="text-[var(--text)]">
          « {highlightTerm(cite.sentence, patterns)} »
        </div>
      </div>
      {total > 1 && (
        <div className="flex items-center justify-between gap-2 px-2 py-[6px] border-t border-[var(--border)] bg-[var(--bg)]">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Citation précédente"
            className="px-2 py-[3px] rounded-[var(--radius-xs)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-warm)] hover:text-[var(--text)] transition-colors"
          >
            ←
          </button>
          <span className="text-[10px] text-[var(--text-muted)]">
            {total} citation{total > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={onNext}
            aria-label="Citation suivante"
            className="px-2 py-[3px] rounded-[var(--radius-xs)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-warm)] hover:text-[var(--text)] transition-colors"
          >
            →
          </button>
        </div>
      )}
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
        // `lower` est passé en normalize() (accents strippés, ligatures
        // dépliées) par le parent — on normalise le terme côté pattern pour
        // garder les deux côtés alignés et matcher "première" ↔ "premiere".
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(
          `(?:^|[^a-z0-9])${escape(normalize(k.term))}(?=$|[^a-z0-9])`,
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
          <span
            key={k.term}
            title={
              k.kind === "extension"
                ? `Extension détectée chez ${k.presence}% des concurrents`
                : k.kind === "exact"
                  ? "Keyword exact"
                  : "Sous-partie du keyword"
            }
            className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-full text-[12px] font-medium border"
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
          </span>
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
      className={`relative px-5 py-[14px] bg-transparent border-none text-[13px] transition-all ${
        active
          ? "text-[var(--text)] font-semibold"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {children}
      {count !== undefined && (
        <span
          className={`ml-[6px] inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-full text-[10px] font-[family-name:var(--font-mono)] font-semibold ${
            active ? "bg-[var(--bg-black)] text-[var(--text-inverse)]" : "bg-[var(--bg-warm)] text-[var(--text-muted)]"
          }`}
        >
          {count}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="absolute left-2 right-2 bottom-[-1px] h-[2px] bg-[var(--bg-black)] rounded-full"
        />
      )}
    </button>
  );
}

function InsightsPane({
  nlp,
  halo,
  serp,
  paa,
  userScore,
  userSeoScore,
  userWordCount,
  userH2Count,
  userH3Count,
}: {
  nlp: NlpResult | null;
  halo: HaloscanOverview | null;
  serp: SerpResult[];
  paa: Paa[];
  userScore: number;
  userSeoScore: number;
  userWordCount: number;
  userH2Count: number;
  userH3Count: number;
}) {
  const vp = serp.filter((r) => (r.wordCount ?? 0) > 0);
  const aW = vp.length ? Math.round(vp.reduce((s, r) => s + (r.wordCount ?? 0), 0) / vp.length) : 0;

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
                tooltip="Volume mensuel moyen de recherches Google France sur ce mot-clé exact (source Haloscan, moyenne sur les 12 derniers mois). C'est la demande potentielle : si tu te positionnes en top 3, tu peux espérer capter ~30% à 40% de ce volume."
              />
            )}
            {halo?.cpc != null && (
              <InsightMetric label="CPC" value={`${halo.cpc.toFixed(2)} €`} tooltip="Coût par clic Google Ads (Haloscan)" />
            )}
            {halo?.kgr != null && (
              <InsightMetric
                label="KGR"
                value={halo.kgr.toFixed(2)}
                tooltip="Keyword Golden Ratio = nombre de pages indexées contenant le mot-clé exact dans leur title (allintitle), divisé par le volume de recherche mensuel. Indicateur de facilité à se positionner : < 0.25 = très facile (golden), entre 0.25 et 1 = correct, > 1 = mot-clé saturé, difficile à attaquer sans autorité de domaine."
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

      <div className="col-span-full">
        <SerpAnalyticsCharts
          serp={serp}
          userScore={userScore}
          userSeoScore={userSeoScore}
          userWordCount={userWordCount}
          userH2Count={userH2Count}
          userH3Count={userH3Count}
        />
      </div>
    </div>
  );
}

/**
 * Bloc d'analyse concurrentielle avec graphiques côte à côte.
 * - Score SEO : barres horizontales, concurrents + nous, ligne moyenne SERP.
 * - Mots : idem.
 * - Sous-titres (H2 + H3 empilés) : idem.
 * - Score vs wordCount : nuage de points pour visualiser la corrélation.
 */
function SerpAnalyticsCharts({
  serp,
  userScore,
  userSeoScore,
  userWordCount,
  userH2Count,
  userH3Count,
}: {
  serp: SerpResult[];
  userScore: number;
  userSeoScore: number;
  userWordCount: number;
  userH2Count: number;
  userH3Count: number;
}) {
  const vp = serp.filter((r) => (r.wordCount ?? 0) > 0);
  if (vp.length === 0) return null;

  const scoreSeries = buildSeries(
    vp.map((r) => ({ label: hostOf(r.link, r.position), value: r.score ?? 0, position: r.position })),
    { label: "Toi", value: userSeoScore, position: -1 },
  );
  const wcSeries = buildSeries(
    vp.map((r) => ({ label: hostOf(r.link, r.position), value: r.wordCount ?? 0, position: r.position })),
    { label: "Toi", value: userWordCount, position: -1 },
  );
  const headingSeries = buildSeries(
    vp.map((r) => ({
      label: hostOf(r.link, r.position),
      value: (r.h2?.length ?? 0) + (r.h3?.length ?? 0),
      h2: r.h2?.length ?? 0,
      h3: r.h3?.length ?? 0,
      position: r.position,
    })),
    {
      label: "Toi",
      value: userH2Count + userH3Count,
      h2: userH2Count,
      h3: userH3Count,
      position: -1,
    },
  );

  const scatterPoints = [
    ...vp.map((r) => ({
      x: r.wordCount ?? 0,
      y: r.score ?? 0,
      label: hostOf(r.link, r.position),
      isMe: false,
    })),
    { x: userWordCount, y: userSeoScore, label: "Toi", isMe: true },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Score SEO concurrents vs toi" dotColor="var(--accent)" subtitle={`Moyenne SERP : ${avg(scoreSeries.competitors.map((c) => c.value))}/100 — Toi : ${userSeoScore}/100`}>
        <BarChartHorizontal series={scoreSeries} max={100} suffix="/100" />
      </ChartCard>

      <ChartCard title="Volume de contenu" dotColor="var(--green)" subtitle={`Moyenne SERP : ${avg(wcSeries.competitors.map((c) => c.value)).toLocaleString("fr-FR")} mots — Toi : ${userWordCount.toLocaleString("fr-FR")} mots`}>
        <BarChartHorizontal
          series={wcSeries}
          max={Math.max(userWordCount, ...wcSeries.competitors.map((c) => c.value))}
          suffix=" mots"
          colorMode="goldilocks"
        />
      </ChartCard>

      <ChartCard title="Sous-titres (H2 + H3)" dotColor="#E85D3A" subtitle={`Moyenne SERP : ${avg(headingSeries.competitors.map((c) => c.value))} — Toi : ${userH2Count + userH3Count}`}>
        <BarChartHorizontalStacked series={headingSeries} />
      </ChartCard>

      <ChartCard title="Score vs Volume" dotColor="var(--purple)" subtitle="Plus en haut à droite = mieux">
        <ScatterChart points={scatterPoints} />
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard title="Ton positionnement" dotColor={userScore >= avg(scoreSeries.competitors.map((c) => c.value)) ? "var(--green)" : "var(--orange)"} subtitle={positioningSubtitle(userSeoScore, scoreSeries.competitors.map((c) => c.value))}>
          <PositioningGauge userScore={userSeoScore} competitors={scoreSeries.competitors.map((c) => c.value)} />
        </ChartCard>
      </div>
    </div>
  );
}

function buildSeries<T extends { label: string; value: number; position: number }>(
  competitors: T[],
  me: T,
): { competitors: T[]; me: T; max: number } {
  const max = Math.max(me.value, ...competitors.map((c) => c.value), 1);
  return { competitors, me, max };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function hostOf(url: string, fallbackPosition: number): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return `#${fallbackPosition}`;
  }
}

function positioningSubtitle(userScore: number, competitors: number[]): string {
  if (competitors.length === 0) return "";
  const sorted = [...competitors, userScore].sort((a, b) => b - a);
  const rank = sorted.indexOf(userScore) + 1;
  return `Tu es classé #${rank} sur ${sorted.length} (avec ${userScore}/100)`;
}

function ChartCard({
  title,
  subtitle,
  dotColor,
  children,
}: {
  title: string;
  subtitle?: string;
  dotColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5">
      <div className="flex items-center gap-[7px] text-[13px] font-semibold mb-1">
        <span className="w-[7px] h-[7px] rounded-full" style={{ background: dotColor }} />
        {title}
      </div>
      {subtitle && (
        <div className="text-[11px] text-[var(--text-muted)] mb-4">{subtitle}</div>
      )}
      <div className="mt-2">{children}</div>
    </div>
  );
}

type BarPoint = { label: string; value: number; position: number };
type StackedBarPoint = BarPoint & { h2: number; h3: number };

function BarChartHorizontal<T extends BarPoint>({
  series,
  max,
  suffix = "",
  colorMode = "higher",
}: {
  series: { competitors: T[]; me: T; max: number };
  max: number;
  suffix?: string;
  /**
   * "higher" : plus c'est haut mieux c'est (score SEO).
   * "goldilocks" : autour de la moyenne = idéal (volume de mots, sous-titres).
   */
  colorMode?: "higher" | "goldilocks";
}) {
  const all = [...series.competitors.sort((a, b) => a.position - b.position), series.me];
  const localMax = Math.max(max, series.max, 1);
  const competitorValues = series.competitors.map((c) => c.value);
  const mean = competitorValues.length
    ? competitorValues.reduce((s, v) => s + v, 0) / competitorValues.length
    : 0;
  return (
    <div className="flex flex-col gap-[6px]">
      {all.map((p, i) => {
        const pct = (p.value / localMax) * 100;
        const isMe = p.position === -1;
        const color = isMe
          ? "var(--accent)"
          : colorMode === "higher"
            ? colorByScoreDeviation(p.value, mean)
            : colorByVolumeDeviation(p.value, mean);
        return (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <div className={`w-[100px] truncate ${isMe ? "font-bold text-[var(--text)]" : "text-[var(--text-secondary)]"}`} title={p.label}>
              {isMe ? "★ Toi" : p.label}
            </div>
            <div className="flex-1 h-[14px] bg-[var(--bg)] rounded-[var(--radius-xs)] overflow-hidden relative">
              <div
                className="h-full rounded-[var(--radius-xs)] transition-all"
                style={{ width: `${Math.max(pct, 2)}%`, background: color, opacity: isMe ? 1 : 0.85 }}
              />
            </div>
            <div className={`font-[family-name:var(--font-mono)] text-[10px] w-[80px] text-right ${isMe ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
              {p.value.toLocaleString("fr-FR")}{suffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarChartHorizontalStacked({
  series,
}: {
  series: { competitors: StackedBarPoint[]; me: StackedBarPoint; max: number };
}) {
  const all = [...series.competitors.sort((a, b) => a.position - b.position), series.me];
  const localMax = Math.max(series.max, 1);
  const competitorTotals = series.competitors.map((c) => c.value);
  const mean = competitorTotals.length
    ? competitorTotals.reduce((s, v) => s + v, 0) / competitorTotals.length
    : 0;
  return (
    <div className="flex flex-col gap-[6px]">
      {all.map((p, i) => {
        const isMe = p.position === -1;
        const h2Pct = (p.h2 / localMax) * 100;
        const h3Pct = (p.h3 / localMax) * 100;
        const baseColor = isMe ? "var(--accent)" : colorByVolumeDeviation(p.value, mean);
        return (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <div className={`w-[100px] truncate ${isMe ? "font-bold text-[var(--text)]" : "text-[var(--text-secondary)]"}`} title={p.label}>
              {isMe ? "★ Toi" : p.label}
            </div>
            <div className="flex-1 h-[14px] bg-[var(--bg)] rounded-[var(--radius-xs)] overflow-hidden flex">
              <div className="h-full" style={{ width: `${h2Pct}%`, background: baseColor, opacity: isMe ? 1 : 0.9 }} />
              <div className="h-full" style={{ width: `${h3Pct}%`, background: baseColor, opacity: isMe ? 0.55 : 0.45 }} />
            </div>
            <div className={`font-[family-name:var(--font-mono)] text-[10px] w-[80px] text-right ${isMe ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
              {p.h2}H2 · {p.h3}H3
            </div>
          </div>
        );
      })}
      <div className="flex gap-3 mt-2 text-[10px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" /> H2 (couleur pleine)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--text-muted)] opacity-50" /> H3 (couleur tamisée)</span>
      </div>
    </div>
  );
}

function ScatterChart({
  points,
}: {
  points: { x: number; y: number; label: string; isMe: boolean }[];
}) {
  const maxX = Math.max(...points.map((p) => p.x), 1);
  const W = 320;
  const H = 220;
  const PAD = 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - 5} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
      <line x1={PAD} y1={5} x2={PAD} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
      {[25, 50, 75].map((y) => {
        const yPx = H - PAD - ((y / 100) * (H - PAD - 5));
        return (
          <g key={y}>
            <line x1={PAD} y1={yPx} x2={W - 5} y2={yPx} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 3" />
            <text x={2} y={yPx + 3} fontSize="9" fill="var(--text-muted)">{y}</text>
          </g>
        );
      })}
      {points.map((p, i) => {
        const cx = PAD + (p.x / maxX) * (W - PAD - 5);
        const cy = H - PAD - ((p.y / 100) * (H - PAD - 5));
        return (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={p.isMe ? 7 : 5}
              fill={p.isMe ? "var(--accent)" : "var(--purple)"}
              opacity={p.isMe ? 1 : 0.7}
              stroke={p.isMe ? "var(--text)" : "none"}
              strokeWidth={p.isMe ? 1.5 : 0}
            >
              <title>{`${p.label} : ${p.x.toLocaleString("fr-FR")} mots, ${p.y}/100`}</title>
            </circle>
            {p.isMe && (
              <text x={cx + 9} y={cy + 4} fontSize="10" fontWeight="bold" fill="var(--text)">★</text>
            )}
          </g>
        );
      })}
      <text x={W / 2} y={H - 4} fontSize="9" fill="var(--text-muted)" textAnchor="middle">Mots</text>
      <text x={3} y={12} fontSize="9" fill="var(--text-muted)">Score</text>
    </svg>
  );
}

function PositioningGauge({
  userScore,
  competitors,
}: {
  userScore: number;
  competitors: number[];
}) {
  const all = [...competitors, userScore].sort((a, b) => a - b);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  return (
    <div className="relative h-[40px]">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] bg-gradient-to-r from-[var(--red)] via-[var(--orange)] to-[var(--green)] rounded-full opacity-50" />
      {competitors.map((c, i) => (
        <div
          key={i}
          className="absolute top-1/2 -translate-y-1/2 w-[8px] h-[8px] rounded-full bg-[var(--purple)] border border-white"
          style={{ left: `calc(${((c - min) / range) * 100}% - 4px)`, opacity: 0.7 }}
          title={`Concurrent : ${c}/100`}
        />
      ))}
      <div
        className="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2"
        style={{ left: `${((userScore - min) / range) * 100}%` }}
      >
        <div className="w-[2px] flex-1 bg-[var(--accent)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1 px-2 py-1 bg-[var(--accent)] text-white text-[10px] font-bold rounded whitespace-nowrap">
          ★ Toi : {userScore}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/**
 * Couleur "more is better" : on est au-dessus, en-dessous, ou autour de la
 * moyenne SERP. Pour le score SEO uniquement : un score haut est toujours bon.
 */
function colorByScoreDeviation(value: number, mean: number): string {
  const delta = value - mean;
  if (delta >= 15) return "var(--green)";
  if (delta >= 5) return "#7BAE5C"; // vert un peu plus pâle
  if (delta >= -5) return "#C7B958"; // jaune (autour de la moyenne)
  if (delta >= -15) return "var(--orange)";
  return "var(--red)";
}

/**
 * Couleur "Goldilocks" : autour de la moyenne = idéal, trop ou trop peu = mauvais.
 * Pour les volumes (mots, sous-titres) où "trop optimisé" est aussi un signal négatif.
 */
function colorByVolumeDeviation(value: number, mean: number): string {
  if (mean <= 0) return "var(--text-muted)";
  const ratio = value / mean;
  if (ratio >= 0.85 && ratio <= 1.15) return "var(--green)"; // idéal
  if (ratio >= 0.7 && ratio <= 1.4) return "#7BAE5C"; // proche
  if (ratio >= 0.5 && ratio <= 1.7) return "#C7B958"; // jaune
  if (ratio >= 0.3 && ratio <= 2.2) return "var(--orange)"; // s'éloigne
  return "var(--red)"; // beaucoup trop court ou beaucoup trop long
}

function CompetitorScoreRow({ scoreTotal, serp }: { scoreTotal: number; serp: SerpResult[] }) {
  const scored = serp.filter((r): r is SerpResult & { score: number } => typeof r.score === "number");
  if (scored.length === 0) return null;
  // Exclure les pages mal crawlées (score effondré) du calcul de la moyenne,
  // cohérent avec medianCompetitorScore. Sinon la moyenne est tirée vers le
  // bas par des pages que notre crawl a ratées, pas par de vrais mauvais
  // contenus. Fallback sur scored si tout est sous le seuil (cas extrême).
  const reliable = scored.filter((r) => r.score >= MIN_VALID_COMPETITOR_SCORE);
  const forAvg = reliable.length > 0 ? reliable : scored;
  const avg = Math.round(forAvg.reduce((s, r) => s + r.score, 0) / forAvg.length);
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
          tooltip={`Moyenne du score SEO sur les ${forAvg.length} concurrents correctement crawlés${forAvg.length < scored.length ? ` (${scored.length - forAvg.length} exclu(s), crawl incomplet)` : ""}.`}
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
    <div title={tooltip}>
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
      className="border rounded-[var(--radius-sm)] px-3 py-[10px] flex flex-col items-center"
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
    <div className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-[13px] text-[var(--text-secondary)] inline-flex items-center">
        {label}
        {tooltip && <InfoBubble text={tooltip} />}
      </span>
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

function SerpCard({ r, briefId }: { r: SerpResult; briefId: string }) {
  const [open, setOpen] = useState(false);
  const hasStructure = (r.h1?.length ?? 0) + (r.h2?.length ?? 0) + (r.h3?.length ?? 0) > 0;
  // Le critère est juste wordCount > 0 (et pas hasStructure) parce que
  // certains contenus utiles n'ont aucun Hn — typiquement les forums "lo-fi"
  // type mxteam.com qui sont des pages de texte brut. Bug remonté par Pierre
  // le 2026-05-02 : mxteam avait 2568 mots et 0 Hn → bouton grisé alors qu'il
  // y avait du vrai contenu.
  // Le serveur reste le garde-fou final : si structuredHtml est null (briefs
  // antérieurs au 2026-05-02), il renvoie 404 et l'UI verra l'erreur.
  const hasContent = (r.wordCount ?? 0) > 0;

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
          {r.score != null && (() => {
            // Détecte les PDF : leur structure HTML est absente (0 H1/H2/H3,
            // 0 images), ce qui fait chuter le score sous le seuil même quand
            // le crawl du texte a parfaitement réussi (ex : tesi.luiss.it/...
            // .pdf, 22670 mots remontés en italien). On les distingue avec un
            // badge "PDF" neutre plutôt que "crawl ✗" qui induit en erreur.
            const isPdf = /\.pdf(?:$|[?#])/i.test(r.link ?? "");
            if (isPdf) {
              return (
                <div title="Document PDF : pas de structure HTML (titres, images) donc le score automatique n'est pas comparable. Le contenu textuel a bien été crawlé et alimente les mots-clés / NLP. Exclu du calcul de la médiane de référence.">
                  <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--red)]">
                    PDF
                  </div>
                </div>
              );
            }
            return r.score < MIN_VALID_COMPETITOR_SCORE ? (
              <div
                title="Score non fiable : page probablement mal crawlée (rendu JavaScript non capté, blocage anti-bot...). Exclue du calcul de la moyenne. Ce n'est pas un jugement sur la qualité réelle du concurrent."
              >
                <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--text-muted)]">
                  ⚠
                </div>
                <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
                  crawl ✗
                </div>
              </div>
            ) : (
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
            );
          })()}
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
          <div title="Nombre d'images dans le contenu éditorial (cap à 30 par page)">
            <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold">
              {r.imageCount ?? "N/A"}
            </div>
            <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
              images
            </div>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={!hasStructure}
            className="px-3 py-[6px] rounded-[var(--radius-xs)] text-[11px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {open ? "▲ Structure" : "▼ Structure"}
          </button>
          <CompetitorDownloadMenu
            briefId={briefId}
            position={r.position}
            variant="button"
            disabled={!hasContent}
          />
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

// Icône engrenage paramètres (Lucide-style, stroke 1.75, 18px) pour le
// bouton "Paramètres du brief" en barre d'actions.
function SettingsGearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
