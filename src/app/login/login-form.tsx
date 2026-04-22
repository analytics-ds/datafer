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
    <form onSubmit={onSubmit} className="w-full max-w-[380px]">
      {/* Brand compact visible uniquement en mobile (sinon le panneau de gauche l'affiche déjà) */}
      <div className="flex items-center gap-3 mb-10 md:hidden">
        <div className="ds-logo text-[var(--text)]">
          <div className="ds-logo-mark">
            <div className="sq sq1" />
            <div className="sq sq2" />
          </div>
          <span className="ds-logo-name">datashake</span>
        </div>
        <div className="w-px h-6 bg-[var(--border)]" />
        <span className="font-semibold text-[14px]">datafer</span>
      </div>

      <span className="inline-flex items-center px-3 py-1 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.6px] uppercase mb-5">
        Connexion
      </span>

      <h1 className="font-[family-name:var(--font-display)] text-[44px] leading-[1.05] tracking-[-1.2px] mb-2">
        Bon retour<em className="italic text-[var(--accent-dark)]">.</em>
      </h1>
      <p className="text-[var(--text-secondary)] text-[14px] leading-[1.55] mb-10">
        Connecte-toi à ton espace datafer pour générer tes briefs et accéder à tes clients.
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
        placeholder="toi@datashake.fr"
        className="w-full px-4 py-[12px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-4 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
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
        placeholder="••••••••"
        className="w-full px-4 py-[12px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-6 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
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

      <p className="text-[11px] text-[var(--text-muted)] mt-10 text-center leading-[1.5]">
        Accès sur invitation uniquement.
        <br />
        Contacte ton admin pour obtenir un compte.
      </p>
    </form>
  );
}
