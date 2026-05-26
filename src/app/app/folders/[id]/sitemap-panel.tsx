"use client";

import { useEffect, useState } from "react";

type Status = "idle" | "syncing" | "failed";

type Props = {
  clientId: string;
  initialSitemapUrl: string | null;
  initialStatus: Status;
  initialLastSyncAt: Date | null;
  initialUrlCount: number;
  initialError: string | null;
};

type ResyncResponse = {
  ok: boolean;
  mode: string;
  urlsInSitemap: number;
  urlsAdded: number;
  urlsRemoved: number;
  urlsChecked: number;
  urlsReembedded: number;
  hasMore: boolean;
  error?: string;
};

// Panneau de configuration du sitemap d'un client, affiché en haut de la
// page /app/folders/[id]. Permet de configurer l'URL du sitemap, lancer un
// resync manuel, et voir l'état courant (compte URLs indexées, last sync).
//
// L'utilisateur ne voit jamais les URLs indexées en détail ici ; la table
// est juste un cache servant le moteur de suggestions côté brief.
export function SitemapPanel({
  clientId,
  initialSitemapUrl,
  initialStatus,
  initialLastSyncAt,
  initialUrlCount,
  initialError,
}: Props) {
  const [sitemapUrl, setSitemapUrl] = useState(initialSitemapUrl ?? "");
  const [status, setStatus] = useState<Status>(initialStatus);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(initialLastSyncAt);
  const [urlCount, setUrlCount] = useState(initialUrlCount);
  const [error, setError] = useState<string | null>(initialError);
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitemapUrl: sitemapUrl.trim() || null }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setSavedMsg("Enregistré");
        setTimeout(() => setSavedMsg(null), 1500);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function resync() {
    if (!sitemapUrl.trim()) {
      setError("Configure d'abord l'URL du sitemap");
      return;
    }
    setResyncing(true);
    setStatus("syncing");
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/sitemap/resync`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as ResyncResponse & { error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || `HTTP ${res.status}`);
        setStatus("failed");
      } else {
        setUrlCount((c) => c + data.urlsAdded);
        setLastSyncAt(new Date());
        setStatus(data.hasMore ? "syncing" : "idle");
      }
    } catch (e) {
      setError((e as Error).message);
      setStatus("failed");
    } finally {
      setResyncing(false);
    }
  }

  return (
    <div className="mb-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--text)]">Maillage interne</h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            Configure le sitemap du client pour activer les suggestions de liens internes dans les briefs.
          </p>
        </div>
        <StatusBadge status={status} urlCount={urlCount} lastSyncAt={lastSyncAt} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="url"
          placeholder="https://exemple.com/sitemap.xml"
          value={sitemapUrl}
          onChange={(e) => setSitemapUrl(e.target.value)}
          className="flex-1 min-w-[280px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-[7px] text-[13px] outline-none focus:border-[var(--text)]"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || sitemapUrl === (initialSitemapUrl ?? "")}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-4 py-[7px] text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--bg-warm)] disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={resync}
          disabled={resyncing || !sitemapUrl.trim()}
          className="rounded-[var(--radius-sm)] bg-[var(--bg-black)] px-4 py-[7px] text-[12px] font-semibold text-[var(--text-inverse)] hover:bg-[var(--bg-dark)] disabled:opacity-50"
        >
          {resyncing ? "Sync en cours…" : urlCount === 0 ? "Lancer l'index" : "Resync"}
        </button>
      </div>

      {savedMsg && <p className="mt-2 text-[12px] text-emerald-600">{savedMsg}</p>}
      {error && <p className="mt-2 text-[12px] text-red-600">Erreur : {error}</p>}
    </div>
  );
}

function StatusBadge({
  status,
  urlCount,
  lastSyncAt,
}: {
  status: Status;
  urlCount: number;
  lastSyncAt: Date | null;
}) {
  // timeAgo dépend de Date.now() qui diffère entre rendu SSR et hydratation
  // client. On rend une string stable côté serveur ("récent") puis on switch
  // sur le vrai timeAgo après mount pour éviter une erreur React #418
  // (hydration text mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (status === "syncing") {
    return (
      <span className="rounded-[var(--radius-pill)] bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">
        Synchronisation…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded-[var(--radius-pill)] bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700">
        Échec du dernier sync
      </span>
    );
  }
  if (urlCount === 0) {
    return (
      <span className="rounded-[var(--radius-pill)] bg-[var(--bg-warm)] px-3 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
        Aucune URL indexée
      </span>
    );
  }
  const when = !lastSyncAt ? "jamais" : mounted ? timeAgo(lastSyncAt) : "récent";
  return (
    <span className="rounded-[var(--radius-pill)] bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
      {urlCount} URLs · {when}
    </span>
  );
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}
