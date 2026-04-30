export type WorkflowStatus = "in_progress" | "drafted" | "published";

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  in_progress: "En cours",
  drafted: "Rédigé",
  published: "Publié",
};

export const WORKFLOW_STATUS_TONES: Record<
  WorkflowStatus,
  { bg: string; color: string; border: string }
> = {
  in_progress: { bg: "var(--bg-warm)", color: "var(--text-secondary)", border: "var(--border-strong)" },
  drafted: { bg: "var(--orange-bg)", color: "var(--orange)", border: "var(--orange)" },
  published: { bg: "var(--green-bg)", color: "var(--green)", border: "var(--green)" },
};

export const WORKFLOW_STATUSES: WorkflowStatus[] = ["in_progress", "drafted", "published"];
