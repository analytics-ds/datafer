export type WorkflowStatus = "pending" | "in_progress" | "drafted" | "published";

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  pending: "En attente",
  in_progress: "En cours",
  drafted: "Rédigé",
  published: "Publié",
};

export const WORKFLOW_STATUS_TONES: Record<
  WorkflowStatus,
  { bg: string; color: string; border: string }
> = {
  pending: { bg: "var(--red-bg)", color: "var(--red)", border: "var(--red)" },
  in_progress: { bg: "#FFE4C4", color: "#B85C00", border: "#B85C00" },
  drafted: { bg: "#FFF4A3", color: "#8A6800", border: "#D4A800" },
  published: { bg: "var(--green-bg)", color: "var(--green)", border: "var(--green)" },
};

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
  "pending",
  "in_progress",
  "drafted",
  "published",
];
