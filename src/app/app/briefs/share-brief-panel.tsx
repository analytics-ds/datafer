"use client";

import { useState, useTransition } from "react";
import { enableBriefShareAction, revokeBriefShareAction } from "./actions";

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
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-4 py-[8px] rounded-[var(--radius-sm)] text-[12px] font-semibold border bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
      >
        <ShareIcon />
        {token ? "Lien client actif" : "Partager au client"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] p-5 w-[400px]">
          <div className="font-semibold text-[14px] mb-1">Partager ce brief</div>
          <p className="text-[12px] text-[var(--text-secondary)] leading-[1.5] mb-4">
            Génère un lien que tu peux envoyer à ton client. Il accède au même éditeur
            que toi : contenu, scoring en temps réel, suggestions NLP. Pas besoin de
            compte datafer.
          </p>

          {token ? (
            <>
              <div className="flex items-center gap-1 mb-3">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 px-3 py-[9px] border-2 border-[var(--border)] rounded-[var(--radius-xs)] outline-none text-[12px] bg-[var(--bg)] font-[family-name:var(--font-mono)]"
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

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
      <circle cx="5" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="15" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9l6-3M7 11l6 3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
