"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/types";

/**
 * Bascule FR/EN. Le choix part en cookie côté serveur puis on rafraîchit la
 * route : tout le rendu (y compris les Server Components) repasse dans la
 * nouvelle langue, sans dupliquer les libellés côté client.
 */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function choose(next: Locale) {
    if (next === locale || saving) return;
    setSaving(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || pending;

  return (
    <div
      className="inline-flex items-center rounded-[6px] border border-[var(--border)] overflow-hidden"
      role="group"
      aria-label={t("common.language")}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            disabled={busy}
            aria-pressed={active}
            title={LOCALE_LABELS[code]}
            className={`px-2 h-6 text-[11px] font-medium uppercase tracking-wide transition-colors disabled:opacity-50 ${
              active
                ? "bg-[var(--text)] text-[var(--bg-card)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text)]"
            }`}
          >
            {compact ? code : LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
