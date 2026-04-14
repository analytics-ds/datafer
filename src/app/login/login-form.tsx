"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Identifiants invalides");
      return;
    }
    router.push(nextUrl);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-[420px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-10 shadow-[var(--shadow)]"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="ds-logo text-[var(--text)]">
          <div className="ds-logo-mark">
            <div className="sq sq1" />
            <div className="sq sq2" />
          </div>
          <span className="ds-logo-name">datashake</span>
        </div>
        <span className="inline-flex items-center gap-[5px] px-3 py-1 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[11px] font-semibold tracking-[0.4px]">
          CONNEXION
        </span>
      </div>

      <h1 className="font-[family-name:var(--font-display)] text-[38px] leading-[1.05] tracking-[-1px] mb-2">
        Bon retour<span className="italic text-[var(--accent-dark)]">.</span>
      </h1>
      <p className="text-[var(--text-secondary)] text-[14px] leading-[1.55] mb-7">
        Connecte-toi à ton espace Datafer.
      </p>

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Email
      </label>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-4 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Mot de passe
      </label>
      <input
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
      />

      {error && (
        <div className="text-[13px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/20 rounded-[var(--radius-xs)] px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] py-[13px] text-[14px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
      >
        {loading ? "Connexion…" : "Se connecter →"}
      </button>

      <p className="text-[11px] text-[var(--text-muted)] mt-7 text-center">
        Accès sur invitation uniquement.
      </p>
    </form>
  );
}
