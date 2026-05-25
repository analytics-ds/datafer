/* Brand assets datashake — Brand Guidelines 2026.
   Le symbole et le wordmark sont inlinés en SVG pour pouvoir suivre
   currentColor (le logo s'utilise exclusivement en noir ou blanc selon
   le fond ; jamais d'autre couleur). */

import type { CSSProperties } from "react";

type LogoMarkProps = {
  /** Taille en pixels (carré). Le SVG natif est en viewBox 100×100. */
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Symbole seul (2 carrés arrondis décalés). Suit currentColor. */
export function LogoMark({ size = 24, className, style }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M0 58.0954C0 52.6106 4.4208 48.1475 9.90547 48.1065C21.3582 48.0209 30.4387 48.0052 42.0095 48.0022C42.8693 48.002 43.7267 47.8913 44.5577 47.6708C44.5986 47.66 44.6395 47.6491 44.6804 47.6383C49.0177 46.4866 52.0055 42.5438 52.0049 38.0563L52.0013 10.0013C52.0006 4.47793 56.478 0 62.0013 0H90C95.5229 0 100 4.47716 100 10V42C100 47.5229 95.5229 52 90 52H58.2002L57.1548 52.0887C51.9782 52.5278 48 56.8577 48 62.0529V90C48 95.5228 43.5229 100 38 100H10C4.47716 100 0 95.5228 0 90V58.0954Z"
        fill="currentColor"
      />
    </svg>
  );
}

type LogoDatashakeProps = {
  /** Hauteur en pixels. La largeur s'adapte au ratio du wordmark + symbole. */
  height?: number;
  className?: string;
};

/** Bloc-marque complet (wordmark "datashake" + symbole à droite). */
export function LogoDatashake({ height = 22, className }: LogoDatashakeProps) {
  /* Ratio du SVG officiel Bloc-marque : on respecte les proportions du
     brandbook pour ne jamais déformer le logo (règle explicite de la charte). */
  return (
    <span
      className={`inline-flex items-center text-current ${className ?? ""}`}
      style={{ height }}
    >
      <span className="font-[family-name:var(--font-body)] font-semibold tracking-[-0.02em]" style={{ fontSize: height * 0.95, lineHeight: 1 }}>
        datashake
      </span>
      <LogoMark size={height * 0.55} style={{ marginLeft: height * 0.25 }} />
    </span>
  );
}

/** Combo "symbole + datafer" utilisé dans la sidebar et les chrome interne. */
export function LogoDatafer({ height = 22, className }: LogoDatashakeProps) {
  return (
    <span
      className={`inline-flex items-center gap-[8px] text-current ${className ?? ""}`}
      style={{ height }}
    >
      <LogoMark size={height * 0.9} />
      <span
        className="font-[family-name:var(--font-body)] font-semibold tracking-[-0.02em]"
        style={{ fontSize: height * 0.85, lineHeight: 1 }}
      >
        datafer
      </span>
    </span>
  );
}
