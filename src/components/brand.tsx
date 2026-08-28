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

/** Nom du produit. Il s'écrit « corpus », en minuscules, comme « datashake ».
    En Season Sans, la typographie de titre de la charte, et en noir ou blanc
    selon le fond, jamais en couleur secondaire.

    Sur la taille : « datashake » porte quatre ascendantes (d, t, h, k), ses
    lettres remplissent donc presque toute la hauteur du bloc-marque. « corpus »
    n'en a aucune. À taille de police égale, il paraît nettement plus petit,
    parce que l'œil compare des hauteurs d'x et non des corps. Les verrous
    ci-dessous le posent donc à une taille supérieure à la hauteur du logo,
    pour que les deux mots pèsent pareil optiquement. */
export function ProductName({
  size = 15,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`df-title ${className ?? ""}`}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      corpus
    </span>
  );
}

/** Verrou complet : bloc-marque datashake, filet de séparation, nom du
    produit. À utiliser partout où la marque n'est pas encore posée, donc sur
    l'écran de connexion et sur les vues partagées au client.
    Le nom est juxtaposé au logo, jamais accolé : la charte interdit de
    modifier le bloc-marque, pas de le poser à côté d'un autre élément. */
export function LogoApp({ height = 22, className }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center text-current ${className ?? ""}`}
      style={{ gap: height * 0.5 }}
    >
      <LogoDatashake height={height} />
      <span
        aria-hidden
        style={{ width: 1, height: height * 1.5, background: "currentColor", opacity: 0.2 }}
      />
      <ProductName size={height * 1.4} />
    </span>
  );
}

/** Verrou compact : symbole seul + nom du produit. Réservé au chrome interne
    (sidebar), où la marque est déjà identifiée — c'est exactement l'usage que
    la charte prévoit pour le symbole seul. */
export function LogoAppCompact({ height = 22, className }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center text-current ${className ?? ""}`}
      style={{ gap: height * 0.42 }}
    >
      <LogoMark size={height} />
      <ProductName size={height * 1.55} />
    </span>
  );
}
