"use client";

/**
 * Désactivé 2026-05-26 : les bulles "i" affichaient des tooltips natifs via
 * l'attribut `title`, mais le comportement était inconsistant (jamais visible
 * dans certains navigateurs/contexts). Retiré de l'UI à la demande de Pierre.
 * Le composant retourne null pour ne pas avoir à toucher tous les sites
 * d'appel ; les props sont conservées pour rester compatible.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function InfoBubble(_props: { text: string; className?: string }) {
  return null;
}
