"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/* Widget feedback "chatbot" : un bouton sticky en bas à droite, présent sur
   toutes les pages /app. Clic = ouvre un panneau slide-over à droite avec
   un mini formulaire (catégorie + message + screenshots).

   Les screenshots peuvent être ajoutés via :
   - drag & drop dans la dropzone
   - paste depuis le presse-papier (Ctrl/Cmd+V) — très utilisé pour les
     captures d'écran système (Cmd+Shift+4 puis Cmd+V)
   - input file classique

   L'URL courante et l'identité de l'utilisateur sont prises automatiquement
   côté API à partir de la session, mais on prévisualise l'URL dans le form
   pour rassurer le user. */

const MAX_SCREENSHOTS = 3;
const MAX_BYTES_PER_FILE = 2_000_000; // 2 Mo
const MAX_MESSAGE_LEN = 4000;

type Category = "bug" | "suggestion" | "question";

const CATEGORIES: Array<{ value: Category; label: string; emoji: string; hint: string }> = [
  { value: "bug", label: "Bug", emoji: "🐛", hint: "Quelque chose ne fonctionne pas comme attendu" },
  { value: "suggestion", label: "Suggestion", emoji: "💡", hint: "Une idée pour améliorer l'outil" },
  { value: "question", label: "Question", emoji: "❓", hint: "Tu veux savoir comment faire quelque chose" },
];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close à la navigation pour éviter qu'il reste ouvert quand on change
  // de page (la nouvelle URL prendrait la place de l'ancienne, perte de
  // contexte pour le rapporteur).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Signaler un bug ou faire un retour"
        className="fixed z-40 right-5 bottom-5 inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] pl-3 pr-4 py-[10px] text-[13px] font-semibold shadow-[var(--shadow-lg)] hover:bg-[var(--bg-dark)] hover:scale-[1.03] transition-all"
      >
        <ChatIcon />
        Feedback
      </button>
      {open && <FeedbackPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const ingestFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    for (const file of arr) {
      if (!file.type.startsWith("image/")) {
        setError("Seules les images sont acceptées en pièce jointe.");
        continue;
      }
      if (file.size > MAX_BYTES_PER_FILE) {
        setError(`Image trop lourde : ${(file.size / 1024 / 1024).toFixed(2)} Mo. Limite ${(MAX_BYTES_PER_FILE / 1024 / 1024).toFixed(1)} Mo.`);
        continue;
      }
      setScreenshots((curr) => {
        if (curr.length >= MAX_SCREENSHOTS) {
          setError(`Maximum ${MAX_SCREENSHOTS} captures par message.`);
          return curr;
        }
        return curr;
      });
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setScreenshots((curr) => (curr.length >= MAX_SCREENSHOTS ? curr : [...curr, reader.result as string]));
          setError(null);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Coller un screenshot depuis le presse-papier (Cmd+V après une capture
  // système). On écoute sur le panneau entier pour que le focus n'ait pas
  // besoin d'être dans un input précis.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        ingestFiles(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingestFiles]);

  async function submit() {
    setError(null);
    if (message.trim().length < 5) {
      setError("Le message doit faire au moins 5 caractères.");
      return;
    }
    if (message.length > MAX_MESSAGE_LEN) {
      setError(`Le message est trop long (max ${MAX_MESSAGE_LEN} caractères).`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          url: currentUrl,
          userAgent: navigator.userAgent,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          screenshots,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Échec de l'envoi, réessaie dans un instant.");
        setSubmitting(false);
        return;
      }
      setSent(true);
      setSubmitting(false);
      setTimeout(() => onClose(), 1800);
    } catch {
      setError("Erreur réseau, vérifie ta connexion.");
      setSubmitting(false);
    }
  }

  const remaining = MAX_MESSAGE_LEN - message.length;
  const tooLong = remaining < 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.35)] backdrop-blur-[2px] animate-[fadeIn_0.15s_ease-out]"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[440px] bg-[var(--bg-card)] border-l border-[var(--border)] shadow-[var(--shadow-lg)] flex flex-col animate-[slideIn_0.2s_ease-out]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)]">
              Feedback
            </div>
            <div className="font-[family-name:var(--font-display)] text-[18px] tracking-[-0.4px] font-semibold">
              On t&apos;écoute<span className="df-accent">.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)]"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="flex-1 flex flex-col items-center justify-center px-7 text-center gap-2">
            <div className="w-14 h-14 rounded-full bg-[var(--green-bg)] text-[var(--green)] flex items-center justify-center text-[26px]">
              ✓
            </div>
            <div className="font-[family-name:var(--font-display)] text-[20px] font-semibold mt-2">
              Merci pour ton retour !
            </div>
            <p className="text-[13px] text-[var(--text-secondary)] leading-[1.5] max-w-[300px]">
              Pierre a reçu un mail avec tes infos. On revient vers toi si on a besoin de précisions.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {/* Catégorie */}
            <div className="mb-4">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
                Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`flex flex-col items-center gap-1 py-[10px] rounded-[var(--radius-sm)] border-2 transition-all ${
                      category === c.value
                        ? "border-[var(--bg-black)] bg-[var(--bg-warm)]"
                        : "border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--bg-card)]"
                    }`}
                  >
                    <span className="text-[18px]">{c.emoji}</span>
                    <span className="text-[11px] font-semibold">{c.label}</span>
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-[6px] italic">
                {CATEGORIES.find((c) => c.value === category)?.hint}
              </div>
            </div>

            {/* Message */}
            <div className="mb-4">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
                Ton message
              </label>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder={
                  category === "bug"
                    ? "Décris ce que tu as essayé de faire et ce qui s'est passé à la place…"
                    : category === "suggestion"
                      ? "Quelle idée tu veux nous partager ?"
                      : "Pose ta question ici…"
                }
                className="w-full px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] transition-colors text-[13px] resize-none leading-[1.5]"
              />
              <div className={`text-[10px] mt-1 text-right font-[family-name:var(--font-mono)] ${tooLong ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>
                {remaining} car. restants
              </div>
            </div>

            {/* Screenshots */}
            <div className="mb-4">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
                Captures d&apos;écran
                <span className="ml-[5px] font-normal normal-case text-[var(--text-muted)]">
                  (facultatif, {screenshots.length}/{MAX_SCREENSHOTS})
                </span>
              </label>
              {screenshots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {screenshots.map((src, i) => (
                    <div key={i} className="relative group rounded-[var(--radius-xs)] overflow-hidden border border-[var(--border)] aspect-square bg-[var(--bg-warm)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setScreenshots((curr) => curr.filter((_, idx) => idx !== i))}
                        aria-label="Retirer cette capture"
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--bg-black)] text-[var(--text-inverse)] flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {screenshots.length < MAX_SCREENSHOTS && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    ingestFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-[var(--radius-sm)] px-4 py-4 text-center cursor-pointer transition-colors ${
                    dragging
                      ? "border-[var(--accent-dark)] bg-[var(--bg-olive-light)]"
                      : "border-[var(--border-strong)] hover:border-[var(--text-muted)] bg-[var(--bg)]"
                  }`}
                >
                  <div className="text-[12px] font-semibold mb-[2px]">
                    Glisse, clique, ou colle (⌘V)
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    PNG, JPG, WebP · max {(MAX_BYTES_PER_FILE / 1024 / 1024).toFixed(1)} Mo
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => ingestFiles(e.target.files)}
                  />
                </div>
              )}
            </div>

            {/* Contexte (URL + envoyé en tant que) */}
            <div className="mb-4 rounded-[var(--radius-xs)] bg-[var(--bg-warm)] border border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
              <div className="flex items-start gap-2 mb-[3px]">
                <span className="text-[var(--text-muted)] shrink-0">Page :</span>
                <span className="font-[family-name:var(--font-mono)] break-all">{shortPath(currentUrl)}</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Ton nom, ton email et l&apos;URL ci-dessus seront envoyés avec ton message.
              </div>
            </div>

            {error && (
              <div className="mb-3 text-[12px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/30 rounded-[var(--radius-xs)] px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}

        {!sent && (
          <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || tooLong || message.trim().length < 5}
              className="px-5 py-[9px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--bg-black)] text-[var(--text-inverse)] hover:bg-[var(--bg-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Envoi…" : "Envoyer →"}
            </button>
          </div>
        )}
      </aside>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 4h12a2 2 0 012 2v7a2 2 0 01-2 2h-4l-4 3v-3H4a2 2 0 01-2-2V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
