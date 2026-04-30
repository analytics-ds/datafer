export type WorkflowStatus = "pending" | "in_progress" | "drafted" | "published";

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  pending: "En attente",
  in_progress: "En cours",
  drafted: "Rédigé",
  published: "Publié",
};

// Logique progressive : gris (pas commencé) → bleu (en action) → orange
// (presque fini, à valider) → vert (terminé). Beaucoup plus parlant qu'un
// simple rouge → orange → jaune → vert où le rouge évoque l'erreur.
export const WORKFLOW_STATUS_TONES: Record<
  WorkflowStatus,
  { bg: string; color: string; border: string }
> = {
  pending: { bg: "#F1F2F4", color: "#6B7280", border: "#D1D5DB" },
  in_progress: { bg: "#E0F2FE", color: "#0369A1", border: "#7DD3FC" },
  drafted: { bg: "#FFEDD5", color: "#C2410C", border: "#FDBA74" },
  published: { bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
};

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
  "pending",
  "in_progress",
  "drafted",
  "published",
];
