"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bulle "?" cliquable qui affiche un popover stateful avec le texte d'aide.
 *
 * Anciennement on s'appuyait sur l'attribut HTML `title` natif (tooltip
 * navigateur). Comportement inconsistant : invisible sur certains
 * navigateurs/touch devices, jamais sur les éléments imbriqués dans des
 * boutons. On utilise maintenant un vrai popover toggleable au clic.
 */
export function InfoBubble({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Côté d'ouverture du popover : à droite du "?" par défaut, mais à gauche
  // quand le "?" est trop près du bord droit du viewport (cas sidebar de
  // l'éditeur : la bulle dépassait de l'écran, retour utilisateur 2026-06).
  const [side, setSide] = useState<"right" | "left">("right");
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const BUBBLE_WIDTH = 260;
  function toggle() {
    if (!open && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setSide(rect.right + BUBBLE_WIDTH + 30 > window.innerWidth ? "left" : "right");
    }
    setOpen((v) => !v);
  }

  // Click outside pour fermer.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-label="Plus d'infos"
        aria-expanded={open}
        className={`ml-1 inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border text-[10px] font-bold leading-none transition-colors ${
          open
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        }`}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute ${side === "right" ? "left-[22px]" : "right-[22px]"} top-1/2 -translate-y-1/2 z-50 w-[260px] max-w-[260px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[11px] font-normal normal-case tracking-normal leading-snug text-[var(--text)] shadow-lg whitespace-normal`}
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>
      )}
    </span>
  );
}
