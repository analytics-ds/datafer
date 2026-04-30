"use client";

import { useEffect, useRef, useState } from "react";
import {
  WORKFLOW_STATUSES,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
  type WorkflowStatus,
} from "./workflow-status";

export function StatusBadge({
  status,
  size = "md",
}: {
  status: WorkflowStatus;
  size?: "sm" | "md";
}) {
  const tone = WORKFLOW_STATUS_TONES[status];
  const sz = size === "sm" ? "text-[11px]" : "text-[12px]";
  return (
    <span
      className={`inline-flex items-center gap-[6px] font-semibold ${sz}`}
      style={{ color: tone.color }}
    >
      <span
        className="inline-block w-[7px] h-[7px] rounded-full"
        style={{ background: tone.color }}
      />
      {WORKFLOW_STATUS_LABELS[status]}
    </span>
  );
}

export function StatusPicker({
  status,
  onChange,
  disabled = false,
  size = "md",
}: {
  status: WorkflowStatus;
  onChange: (next: WorkflowStatus) => void | Promise<void>;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Changer le statut éditorial"
        className={`inline-flex items-center gap-1 transition-opacity ${disabled ? "opacity-60 cursor-default" : "hover:opacity-80 cursor-pointer"}`}
      >
        <StatusBadge status={status} size={size} />
        {!disabled && (
          <svg width="9" height="9" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 8l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] py-1 min-w-[140px]">
          {WORKFLOW_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                if (s !== status) void onChange(s);
              }}
              className={`w-full text-left flex items-center gap-2 px-3 py-[7px] text-[13px] hover:bg-[var(--bg-warm)] transition-colors ${
                s === status ? "bg-[var(--bg-warm)] font-semibold" : ""
              }`}
            >
              <StatusBadge status={s} size="sm" />
              {s === status && (
                <span className="ml-auto text-[var(--accent-dark)] text-[12px]">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
