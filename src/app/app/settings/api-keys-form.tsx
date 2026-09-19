"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";
import { useI18n } from "@/lib/i18n/context";
import { intlLocale } from "@/lib/relative-date";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export function ApiKeysForm({ keys }: { keys: ApiKeyRow[] }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("creating");
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await createApiKeyAction(fd);
    if (res.ok) {
      const name = String(fd.get("name") ?? "") || t("apiKeys.defaultName");
      setFresh({ key: res.key, name });
      setStatus("idle");
      (e.currentTarget as HTMLFormElement).reset();
      router.refresh();
    } else {
      setStatus("error");
      setError(res.error);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm(t("apiKeys.revoke.confirm"))) return;
    const res = await revokeApiKeyAction(id);
    if (res.ok) router.refresh();
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)]">
      <form onSubmit={onCreate} className="flex items-end gap-3 mb-6">
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[6px]">
            {t("apiKeys.name")}
          </label>
          <input
            type="text"
            name="name"
            placeholder={t("apiKeys.name.placeholder")}
            className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
          />
        </div>
        <button
          type="submit"
          disabled={status === "creating"}
          className="inline-flex items-center justify-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-5 py-[10px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
        >
          {status === "creating" ? t("apiKeys.generating") : t("apiKeys.generate")}
        </button>
      </form>

      {error && (
        <div className="text-[13px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)]/20 rounded-[var(--radius-xs)] px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {fresh && (
        <div className="border-2 border-[var(--bg-black)] bg-[var(--bg-warm)] rounded-[var(--radius-sm)] p-4 mb-6">
          <div className="text-[12px] font-semibold mb-2">
            {t("apiKeys.fresh", { name: fresh.name })}
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 block font-code text-[12px] bg-[var(--bg-black)] text-[var(--text-inverse)] px-3 py-2 rounded-[var(--radius-xs)] break-all">
              {fresh.key}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(fresh.key)}
              className="text-[12px] font-semibold bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-xs)] px-3 py-2 hover:bg-[var(--bg-dark)] transition-colors"
            >
              {t("common.copy")}
            </button>
            <button
              type="button"
              onClick={() => setFresh(null)}
              className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              {t("apiKeys.hide")}
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)]">{t("apiKeys.empty")}</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.2px] text-[var(--text-muted)] text-left">
              <th className="pb-2 font-semibold">{t("apiKeys.col.name")}</th>
              <th className="pb-2 font-semibold">{t("apiKeys.col.prefix")}</th>
              <th className="pb-2 font-semibold">{t("apiKeys.col.created")}</th>
              <th className="pb-2 font-semibold">{t("apiKeys.col.lastUsed")}</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-[var(--border)]">
                <td className="py-3 font-medium">{k.name}</td>
                <td className="py-3 font-mono text-[12px] text-[var(--text-muted)]">{k.prefix}…</td>
                <td className="py-3 text-[var(--text-muted)]">
                  {new Date(k.createdAt).toLocaleDateString(intlLocale(locale))}
                </td>
                <td className="py-3 text-[var(--text-muted)]">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString(intlLocale(locale)) : "—"}
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onRevoke(k.id)}
                    className="text-[12px] text-[var(--red)] hover:underline font-semibold"
                  >
                    {t("apiKeys.revoke")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
