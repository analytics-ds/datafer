import type { TranslationKey } from "@/lib/i18n";

export type WorkflowStatus = "pending" | "in_progress" | "drafted" | "published";

/** Clés i18n des statuts : le libellé se résout à l'affichage, jamais ici,
 *  pour qu'un même brief se lise en français chez nous et en anglais chez le
 *  client qui ouvre le lien de partage. */
export const WORKFLOW_STATUS_KEYS = {
  pending: "workflow.pending",
  in_progress: "workflow.in_progress",
  drafted: "workflow.drafted",
  published: "workflow.published",
} as const satisfies Record<WorkflowStatus, TranslationKey>;

// Logique progressive : gris (pas commencé) → bleu (en action) → jaune
// (presque fini, à valider) → kaki (terminé).
//
// Charte datashake : ce sont des tags, l'un des rares usages où les couleurs
// secondaires sont autorisées. Elles ne portent donc que le fond voilé et la
// bordure ; le libellé reste en noir, puisque la charte réserve le texte au
// noir et au blanc.
export const WORKFLOW_STATUS_TONES: Record<
  WorkflowStatus,
  { bg: string; color: string; border: string }
> = {
  pending: { bg: "var(--brand-grey-light)", color: "var(--text-secondary)", border: "var(--brand-grey-medium)" },
  in_progress: { bg: "var(--state-info-bg)", color: "var(--text)", border: "var(--brand-blue)" },
  drafted: { bg: "var(--state-warn-bg)", color: "var(--text)", border: "var(--brand-yellow)" },
  published: { bg: "var(--state-ok-bg)", color: "var(--text)", border: "var(--brand-kaki)" },
};

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
  "pending",
  "in_progress",
  "drafted",
  "published",
];
