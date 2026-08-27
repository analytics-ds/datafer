/* Assets de marque datashake — Brand Style Guidelines 2026.

   La charte impose trois choses sur le logo :
   - le bloc-marque complet (wordmark + symbole à droite) est la version
     principale ;
   - le symbole seul est réservé aux contextes où la marque est déjà
     identifiée (favicon, icône d'application, chrome interne) ;
   - logo et symbole s'emploient exclusivement en noir ou en blanc, jamais
     déformés, jamais recolorés, toujours en vectoriel.

   Les fichiers officiels de `public/brand/` sont donc utilisés tels quels, en
   masque CSS : la forme reste le vecteur fourni par la charte, et la couleur
   suit `currentColor`, ce qui garantit le noir sur fond clair et le blanc sur
   fond noir sans jamais recolorer le tracé. Les ratios sont ceux des SVG
   d'origine, pour ne pas déformer le logo. */

import type { CSSProperties } from "react";

/* Ratios relevés sur les viewBox des SVG officiels. */
const BLOC_RATIO = 612 / 95;
const WORDMARK_RATIO = 525 / 80;

function maskStyle(src: string): CSSProperties {
  return {
    backgroundColor: "currentColor",
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };
}

type LogoMarkProps = {
  /** Taille en pixels (carré). */
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Symbole seul. Suit currentColor : noir ou blanc selon le fond. */
export function LogoMark({ size = 24, className, style }: LogoMarkProps) {
  return (
    <span
      role="img"
      aria-label="datashake"
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        ...maskStyle("/brand/symbole-black.svg"),
        ...style,
      }}
    />
  );
}

type LogoProps = {
  /** Hauteur en pixels. La largeur suit le ratio officiel du fichier. */
  height?: number;
  className?: string;
};

/** Bloc-marque complet : wordmark « datashake » + symbole à droite. */
export function LogoDatashake({ height = 22, className }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="datashake"
      className={className}
      style={{
        display: "inline-block",
        height,
        width: height * BLOC_RATIO,
        flexShrink: 0,
        ...maskStyle("/brand/logo-datashake-black.svg"),
      }}
    />
  );
}

/** Wordmark seul, sans le symbole. */
export function LogoWordmark({ height = 20, className }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="datashake"
      className={className}
      style={{
        display: "inline-block",
        height,
        width: height * WORDMARK_RATIO,
        flexShrink: 0,
        ...maskStyle("/brand/wordmark-black.svg"),
      }}
    />
  );
}

/** Marque du chrome interne (sidebar, en-têtes d'écrans partagés).
    L'outil n'affiche aucun nom de produit : seul le bloc-marque datashake
    identifie l'interface. */
export function LogoApp({ height = 22, className }: LogoProps) {
  return <LogoDatashake height={height} className={className} />;
}
