"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "./actions";

export function ProfileForm({
  initial,
}: {
  initial: { name: string; email: string; image: string };
}) {
  const router = useRouter();
  const [image, setImage] = useState(initial.image);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const initials =
    (initial.name || initial.email).slice(0, 2).toUpperCase();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await updateProfileAction(fd);
    if (res.ok) {
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 2000);
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
      {/* Avatar preview */}
      <div className="flex items-center gap-4 mb-6">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt="Avatar"
            className="w-16 h-16 rounded-full object-cover border border-[var(--border)]"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-[var(--bg-olive-light)] text-[var(--accent-dark)] flex items-center justify-center text-[20px] font-semibold">
            {initials}
          </div>
        )}
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
            URL de photo de profil
          </label>
          <input
            type="url"
            name="image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…/photo.jpg"
            className="w-full px-4 py-[10px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] transition-colors text-[13px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Nom complet
      </label>
      <input
        type="text"
        name="name"
        required
        defaultValue={initial.name}
        className="w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] mb-5 outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)]"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
        Email
      </label>
      <input
        type="email"
        name="email"
        required
        defaultValue={initial.email}
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
          {status === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>
        {status === "saved" && (
          <span className="text-[12px] text-[var(--green)] font-semibold">
            ✓ Modifications enregistrées
          </span>
        )}
      </div>
    </form>
  );
}
