"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { faviconUrl } from "@/lib/favicon";

type Folder = { id: string; name: string; website: string | null };

type SidebarProps = {
  user: { id: string; email: string; name: string; image: string | null };
  personalFolders: Folder[];
  agencyFolders: Folder[];
};

export function Sidebar({ user, personalFolders, agencyFolders }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  return (
    <aside className="w-[260px] shrink-0 h-screen sticky top-0 bg-[var(--bg-card)] border-r border-[var(--border)] flex flex-col">
      <div className="px-5 h-14 flex items-center border-b border-[var(--border)]">
        <div className="ds-logo text-[var(--text)]">
          <div className="ds-logo-mark">
            <div className="sq sq1" />
            <div className="sq sq2" />
          </div>
          <span className="ds-logo-name">datafer</span>
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <Link
          href="/app/briefs/new"
          className="flex items-center justify-center gap-2 w-full bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] py-[10px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
        >
          <PlusIcon className="w-[14px] h-[14px]" />
          Nouveau brief
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 text-[13px]">
        <NavItem href="/app" icon={<HomeIcon />} active={pathname === "/app"}>
          Accueil
        </NavItem>
        <NavItem
          href="/app/briefs"
          icon={<DocIcon />}
          active={pathname === "/app/briefs" || pathname?.startsWith("/app/briefs/")}
        >
          Tous les briefs
        </NavItem>

        <NavSection
          title="Mes dossiers"
          action={
            <Link href="/app/folders/new" className="sb-plus-btn" aria-label="Nouveau dossier">
              <PlusIcon className="w-[12px] h-[12px]" />
            </Link>
          }
        >
          {personalFolders.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] px-3 py-2 italic">Aucun dossier.</p>
          ) : (
            personalFolders.map((f) => (
              <FolderItem
                key={f.id}
                href={`/app/folders/${f.id}`}
                active={pathname === `/app/folders/${f.id}`}
                website={f.website}
              >
                {f.name}
              </FolderItem>
            ))
          )}
        </NavSection>

        <NavSection
          title="Dossiers datashake"
          action={
            <Link href="/app/agency/new" className="sb-plus-btn" aria-label="Nouveau dossier agence">
              <PlusIcon className="w-[12px] h-[12px]" />
            </Link>
          }
        >
          {agencyFolders.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] px-3 py-2 italic">Aucun dossier.</p>
          ) : (
            agencyFolders.map((f) => (
              <FolderItem
                key={f.id}
                href={`/app/agency/${f.id}`}
                active={pathname === `/app/agency/${f.id}`}
                website={f.website}
              >
                {f.name}
              </FolderItem>
            ))
          )}
        </NavSection>
      </nav>

      <div className="px-3 py-3 border-t border-[var(--border)]">
        <Link
          href="/app/settings"
          className={`flex items-center gap-[10px] p-2 rounded-[var(--radius-sm)] transition-colors ${
            pathname?.startsWith("/app/settings")
              ? "bg-[var(--bg-warm)]"
              : "hover:bg-[var(--bg)]"
          }`}
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="w-9 h-9 rounded-full object-cover border border-[var(--border)] shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[var(--bg-olive-light)] text-[var(--accent-dark)] flex items-center justify-center text-[12px] font-semibold shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate leading-tight">
              {user.name}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate">
              {user.email}
            </div>
          </div>
          <CogIcon className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        </Link>
        <button
          onClick={onLogout}
          className="mt-2 w-full text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors py-1"
        >
          Déconnexion
        </button>
      </div>

      <style jsx>{`
        :global(.sb-plus-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 6px;
          color: var(--text-muted);
          transition: background 0.2s, color 0.2s;
        }
        :global(.sb-plus-btn:hover) {
          background: var(--bg-warm);
          color: var(--text);
        }
      `}</style>
    </aside>
  );
}

function NavItem({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-[10px] px-3 py-[7px] rounded-[var(--radius-sm)] transition-colors ${
        active
          ? "bg-[var(--bg-warm)] text-[var(--text)] font-semibold"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
      }`}
    >
      <span className="shrink-0 w-4 h-4">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function NavSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-3 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)]">
          {title}
        </span>
        {action}
      </div>
      <div className="flex flex-col gap-[1px]">{children}</div>
    </div>
  );
}

function FolderItem({
  href,
  active,
  website,
  children,
}: {
  href: string;
  active: boolean;
  website: string | null;
  children: React.ReactNode;
}) {
  const favicon = faviconUrl(website, 32);
  return (
    <Link
      href={href}
      className={`flex items-center gap-[10px] px-3 py-[6px] rounded-[var(--radius-sm)] transition-colors ${
        active
          ? "bg-[var(--bg-warm)] text-[var(--text)] font-semibold"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
      }`}
    >
      <FolderIcon favicon={favicon} />
      <span className="truncate">{children}</span>
    </Link>
  );
}

function FolderIcon({ favicon, size = 16 }: { favicon: string | null; size?: number }) {
  if (favicon) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={favicon}
        alt=""
        width={size}
        height={size}
        className="rounded-[3px] shrink-0 bg-[var(--bg-warm)]"
        loading="lazy"
      />
    );
  }
  return (
    <span
      className="shrink-0 rounded-[3px] bg-[var(--bg-warm)] text-[var(--text-muted)] flex items-center justify-center text-[10px]"
      style={{ width: size, height: size }}
    >
      ·
    </span>
  );
}

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <path d="M3 10l7-6 7 6v7a1 1 0 01-1 1h-3v-5H7v5H4a1 1 0 01-1-1v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
      <path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function CogIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M15.5 10c0-.4 0-.8-.1-1.1l1.8-1.4-1.8-3.1-2.1.8a5 5 0 00-1.9-1.1L11 2h-2l-.4 2.1a5 5 0 00-1.9 1.1l-2.1-.8-1.8 3.1 1.8 1.4c-.1.3-.1.7-.1 1.1s0 .8.1 1.1L2.8 12.5l1.8 3.1 2.1-.8a5 5 0 001.9 1.1L9 18h2l.4-2.1a5 5 0 001.9-1.1l2.1.8 1.8-3.1-1.8-1.4c.1-.3.1-.7.1-1.1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
