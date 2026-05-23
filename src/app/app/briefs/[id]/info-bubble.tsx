"use client";

/**
 * Petite bulle "i" cliquable qui affiche un tooltip natif au hover (via
 * attribut HTML `title`). Utilisée à côté des termes techniques (KGR,
 * cosinus, médiane, presence...) pour expliquer ce que c'est sans
 * encombrer l'UI. Volontairement minimaliste : pas de portail, pas de
 * stateful tooltip, le navigateur affiche le title au survol.
 */
export function InfoBubble({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      title={text}
      className={`ml-1 inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border border-[var(--border-strong)] text-[9px] font-bold text-[var(--text-muted)] cursor-help align-middle hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors ${className}`}
      aria-label="Plus d'infos"
    >
      i
    </span>
  );
}
