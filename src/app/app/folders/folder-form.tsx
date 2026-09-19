"use client";

import { createFolderAction } from "./actions";
import { useT } from "@/lib/i18n/context";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS } from "@/lib/i18n/types";

export function FolderForm({ scope }: { scope: "personal" | "agency" }) {
  const t = useT();
  return (
    <form
      action={createFolderAction}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] max-w-[560px]"
    >
      <input type="hidden" name="scope" value={scope} />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[6px]">
        {t("folderForm.name")}
      </label>
      <input
        type="text"
        name="name"
        required
        autoFocus
        placeholder={t("folderForm.name.placeholder")}
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[6px]">
        {t("folderForm.website")}{" "}
        <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">
          {t("folderForm.website.hint")}
        </span>
      </label>
      <input
        type="url"
        name="website"
        placeholder="https://www.exemple.com"
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-2 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
      />
      <p className="text-[11px] text-[var(--text-muted)] mb-5">
        {t("folderForm.favicon")}
      </p>

      <label className="block text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-[6px]">
        {t("folderForm.locale")}
      </label>
      <div className="flex gap-2 mb-2">
        {LOCALES.map((code) => (
          <label
            key={code}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-[10px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-medium cursor-pointer hover:border-[var(--border-strong)] transition-colors has-[:checked]:border-[var(--bg-black)] has-[:checked]:bg-[var(--bg-warm)]"
          >
            <input
              type="radio"
              name="locale"
              value={code}
              defaultChecked={code === DEFAULT_LOCALE}
              className="accent-[var(--bg-black)]"
            />
            {LOCALE_LABELS[code]}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-7">
        {t("folderForm.locale.hint")}
      </p>

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-6 py-[11px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
      >
        {t("folderForm.submit")}
      </button>
    </form>
  );
}
