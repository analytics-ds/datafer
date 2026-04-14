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
      className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl p-8 shadow-sm"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Datafer</h1>
        <p className="text-sm text-neutral-500 mt-1">Connexion</p>
      </div>

      <label className="block text-xs font-medium text-neutral-700 mb-1">Email</label>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg mb-4 outline-none focus:border-neutral-900 transition"
      />

      <label className="block text-xs font-medium text-neutral-700 mb-1">Mot de passe</label>
      <input
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg mb-4 outline-none focus:border-neutral-900 transition"
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>

      <p className="text-xs text-neutral-400 mt-6 text-center">
        Accès sur invitation uniquement.
      </p>
    </form>
  );
}
