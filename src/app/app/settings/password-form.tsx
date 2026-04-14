"use client";

import { useState } from "react";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await changePasswordAction(fd);
    if (res.ok) {
      setStatus("saved");
      form.reset();
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      setStatus("error");
      setError(res.error);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)]"
    >
      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Mot de passe actuel
      </label>
      <input
        type="password"
        name="currentPassword"
        required
        autoComplete="current-password"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Nouveau mot de passe
      </label>
      <input
        type="password"
        name="newPassword"
        required
        minLength={6}
        autoComplete="new-password"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Confirmer le nouveau mot de passe
      </label>
      <input
        type="password"
        name="confirm"
        required
        autoComplete="new-password"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-6 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
      />

      {error && (
        <div className="text-[13px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/20 rounded-[var(--radius-xs)] px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="inline-flex items-center justify-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-5 py-[10px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
        >
          {status === "saving" ? "Mise à jour…" : "Changer le mot de passe"}
        </button>
        {status === "saved" && (
          <span className="text-[12px] text-[var(--green)] font-semibold">
            ✓ Mot de passe mis à jour
          </span>
        )}
      </div>
    </form>
  );
}
