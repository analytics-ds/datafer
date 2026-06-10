"use client";

import { useEffect, useRef, useState } from "react";

const BUBBLE_WIDTH = 260;
const GAP = 8;

/**
 * Bulle "?" cliquable qui affiche un popover stateful avec le texte d'aide.
 *
 * Anciennement on s'appuyait sur l'attribut HTML `title` natif (tooltip
 * navigateur). Comportement inconsistant : invisible sur certains
 * navigateurs/touch devices, jamais sur les éléments imbriqués dans des
 * boutons. On utilise maintenant un vrai popover toggleable au clic.
 *
 * Le popover est en `position: fixed` calculée au moment de l'ouverture :
 * un positionnement absolu dans la sidebar (overflow-y-auto) était clippé
 * par le conteneur scrollable et dépassait du viewport à droite (retour
 * utilisateur 2026-06). Fixed échappe au clipping ; on ferme au scroll pour
 * éviter une bulle orpheline désalignée.
 */
export function InfoBubble({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const open = pos !== null;

  function toggle() {
    if (open) {
      setPos(null);
      return;
    }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    // À droite du "?" si la bulle tient dans le viewport, sinon à gauche.
    let left = rect.right + GAP;
    if (left + BUBBLE_WIDTH > window.innerWidth - 8) {
      left = rect.left - GAP - BUBBLE_WIDTH;
    }
    left = Math.max(8, left);
    // Centrée verticalement sur le "?", clampée dans le viewport.
    const top = Math.min(Math.max(rect.top + rect.height / 2, 60), window.innerHeight - 60);
    setPos({ top, left });
  }

  // Click outside / Esc / scroll pour fermer.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPos(null);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null);
    }
    function onScroll() {
      setPos(null);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEsc);
    // capture: true pour attraper les scrolls des conteneurs internes
    // (sidebar overflow-y-auto), pas seulement celui de la fenêtre.
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("scroll", onScroll, true);
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
      {pos && (
        <span
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: BUBBLE_WIDTH }}
          className="-translate-y-1/2 z-50 block rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[11px] font-normal normal-case tracking-normal leading-snug text-[var(--text)] shadow-lg whitespace-normal"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>
      )}
    </span>
  );
}
