"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { enableBriefShareAction, revokeBriefShareAction } from "./actions";
import { ShareIcon, XIcon } from "@/components/icons";

export function ShareBriefPanel({
  briefId,
  initialToken,
}: {
  briefId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const url = token
    ? typeof window !== "undefined"
      ? `${window.location.origin}/share-brief/${token}`
      : `/share-brief/${token}`
    : "";

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function enable() {
    startTransition(async () => {
      const res = await enableBriefShareAction(briefId);
      if (res.ok) setToken(res.token);
    });
  }

  function revoke() {
    startTransition(async () => {
      const res = await revokeBriefShareAction(briefId);
      if (res.ok) setToken(null);
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-4 py-[8px] rounded-[var(--radius-sm)] text-[12px] font-semibold border bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
      >
        <ShareIcon size={14} />
        {token ? "Lien client actif" : "Partager au client"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] p-5 pt-9 w-[400px]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)] transition-colors"
          >
            <XIcon size={14} />
          </button>
          <div className="font-semibold text-[14px] mb-1">Partager ce brief</div>
          <p className="text-[12px] text-[var(--text-secondary)] leading-[1.5] mb-4">
            Génère un lien à envoyer au client. Il accède au même éditeur
            que nous : contenu, scoring en temps réel, suggestions NLP. Pas besoin de
            compte.
          </p>

          {token ? (
            <>
              <div className="flex items-center gap-1 mb-3">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none text-[12px] bg-[var(--bg)] font-mono"
                />
                <button
                  onClick={copy}
                  className="px-3 py-[9px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-xs)] text-[12px] font-semibold hover:bg-[var(--bg-dark)] transition-colors shrink-0"
                >
                  {copied ? "✓" : "Copier"}
                </button>
              </div>
              <button
                onClick={revoke}
                disabled={pending}
                className="w-full text-[12px] text-[var(--red)] hover:bg-[var(--red-bg)] border border-[var(--red)]/30 rounded-[var(--radius-xs)] py-[9px] font-semibold disabled:opacity-50 transition-colors"
              >
                Révoquer le lien
              </button>
            </>
          ) : (
            <button
              onClick={enable}
              disabled={pending}
              className="w-full bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-xs)] py-[10px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
            >
              Générer un lien de partage
            </button>
          )}
        </div>
      )}
    </div>
  );
}
