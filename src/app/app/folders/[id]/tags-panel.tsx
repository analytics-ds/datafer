"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TAG_COLORS } from "@/lib/tags-service";
import type { TagDTO } from "../../briefs/tag-picker";
import { TagChip } from "../../briefs/tag-picker";
import { createFolderTagAction, deleteTagAction } from "./tags-actions";

export function TagsPanel({
  folderId,
  folderName,
  initialTags,
}: {
  folderId: string;
  folderName: string;
  initialTags: TagDTO[];
}) {
  const router = useRouter();
  const [tags, setTags] = useState<TagDTO[]>(initialTags);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createFolderTagAction(folderId, name.trim(), color);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTags((curr) => (curr.some((x) => x.id === res.tag.id) ? curr : [...curr, res.tag]));
      setName("");
      router.refresh();
    });
  }

  function onDelete(tagId: string) {
    startTransition(async () => {
      const res = await deleteTagAction(tagId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTags((curr) => curr.filter((t) => t.id !== tagId));
      setConfirmId(null);
      router.refresh();
    });
  }

  const confirmTag = tags.find((t) => t.id === confirmId);

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-[14px]">Tags du dossier</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-[2px]">
            Les tags créés ici n&apos;existent que dans l&apos;écosystème <strong>{folderName}</strong>. Ils restent
            sauvegardés tant que tu ne les supprimes pas.
          </p>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-4">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <TagChip tag={t} size="md" />
              <button
                type="button"
                onClick={() => setConfirmId(t.id)}
                aria-label={`Supprimer le tag ${t.name}`}
                title="Supprimer définitivement"
                className="w-5 h-5 inline-flex items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 6h12M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2m1 0v10a1 1 0 01-1 1H7a1 1 0 01-1-1V6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-[var(--text-muted)] italic mb-4">
          Aucun tag pour ce dossier. Crée le premier ci-dessous.
        </p>
      )}

      <form onSubmit={onCreate} className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du tag (ex. saison hiver)"
          maxLength={40}
          disabled={pending}
          className="px-3 py-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] flex-1 min-w-[200px]"
        />
        <div className="flex items-center gap-1">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
              className={`w-[20px] h-[20px] rounded-full border-2 transition-transform ${color === c ? "scale-110" : ""}`}
              style={{
                background: c,
                borderColor: color === c ? "var(--text)" : "transparent",
              }}
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="px-4 py-[8px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] text-[13px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-40 transition-colors"
        >
          + Créer
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-[var(--red)]">{error}</p>}

      {confirmTag && (
        <div
          className="fixed inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !pending && setConfirmId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-7 w-[440px] max-w-full shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center gap-2 mb-3 text-[var(--red)]">
              <span className="font-semibold text-[16px]">Supprimer ce tag</span>
            </div>
            <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] mb-5">
              Le tag <TagChip tag={confirmTag} size="md" /> sera définitivement supprimé et détaché de tous
              les briefs qui le portaient. Action irréversible.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                disabled={pending}
                className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold border border-[var(--border)] hover:bg-[var(--bg-warm)] disabled:opacity-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => onDelete(confirmTag.id)}
                disabled={pending}
                className="px-4 py-[10px] rounded-[var(--radius-sm)] text-[13px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {pending ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
