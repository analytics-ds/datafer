"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/types";

/**
 * Langue d'affichage du dossier client.
 *
 * C'est le réglage qui fait qu'un client US ouvre son lien de partage en
 * anglais sans rien toucher : la valeur est héritée par tous les briefs du
 * dossier et par ses liens de partage (cf. src/lib/i18n/server.ts). Un choix
 * explicite dans le sélecteur du header reste prioritaire, pour chacun.
 */
export function LocalePanel({
  clientId,
  initialLocale,
}: {
  clientId: string;
  initialLocale: Locale;
}) {
  const t = useT();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: Locale) {
    if (next === locale || saving) return;
    const previous = locale;
    setLocale(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setLocale(previous);
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } catch (e) {
      setLocale(previous);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--text)]">
            {t("folderLocale.title")}
          </h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5 max-w-[520px]">
            {t("folderLocale.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => choose(code)}
              disabled={saving}
              aria-pressed={code === locale}
              className={`px-3 py-[7px] rounded-[var(--radius-sm)] border text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                code === locale
                  ? "border-[var(--bg-black)] bg-[var(--bg-black)] text-[var(--text-inverse)]"
                  : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg-warm)]"
              }`}
            >
              {LOCALE_LABELS[code]}
            </button>
          ))}
        </div>
      </div>
      {saved && <p className="mt-2 text-[12px] text-[var(--text)]">{t("folderLocale.saved")}</p>}
      {error && <p className="mt-2 text-[12px] text-[var(--red)]">{t("sitemap.error", { error })}</p>}
    </div>
  );
}
