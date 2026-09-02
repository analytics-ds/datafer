"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { faviconUrl } from "@/lib/favicon";
import { LogoApp } from "@/components/brand";
import {
  SidebarIcon,
  CaretRightIcon,
  PlusIcon,
  HouseIcon,
  FileTextIcon,
  FoldersIcon,
  TrayIcon,
  GearIcon,
} from "@/components/icons";

type Favorite = { id: string; name: string; website: string | null };

type SidebarProps = {
  user: { id: string; email: string; name: string; image: string | null; level: number };
  favorites: Favorite[];
  /** Affiche les liens d'administration (page Feedback). Réservé à Pierre. */
  isAdmin?: boolean;
};

export function Sidebar({ user, favorites, isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Sidebar masquable, préférence persistée en localStorage. Ouverte par
  // défaut ; lecture du localStorage en effect (pas dans l'initializer) pour
  // éviter un mismatch d'hydratation SSR.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // Resynchronise l'état avec le localStorage (système externe) au mount :
    // on ne peut pas le lire dans l'initializer du useState sans provoquer un
    // mismatch d'hydratation (le serveur rend toujours "ouverte").
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem("corpus-sidebar") === "closed") setCollapsed(true);
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem("corpus-sidebar", c ? "open" : "closed");
      return !c;
    });

  async function onLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  // Repliée : fine bande cliquable sur le bord gauche pour rouvrir, doublée
  // d'un bouton flottant en haut à gauche. La bande seule était trop discrète
  // pour être retrouvée (retour Pierre 2026-06-13).
  if (collapsed) {
    return (
      <>
        <aside className="w-[20px] shrink-0 h-screen sticky top-0 bg-[var(--bg-card)] border-r border-[var(--border)]">
          <button
            onClick={toggleCollapsed}
            title="Afficher le menu"
            aria-label="Afficher le menu"
            className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)] transition-colors"
          >
            <CaretRightIcon size={14} />
          </button>
        </aside>
        <button
          onClick={toggleCollapsed}
          title="Afficher le menu"
          aria-label="Afficher le menu"
          className="fixed left-[32px] top-[16px] z-40 w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-sm)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)] transition-colors"
        >
          <SidebarIcon size={16} />
        </button>
      </>
    );
  }

  return (
    <aside className="w-[260px] shrink-0 h-screen sticky top-0 bg-[var(--bg-card)] border-r border-[var(--border)] flex flex-col">
      <div className="pl-5 pr-3 h-[68px] flex items-center justify-between border-b border-[var(--border)]">
        <LogoApp height={17} />
        <button
          onClick={toggleCollapsed}
          title="Masquer le menu"
          aria-label="Masquer le menu"
          className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-warm)] transition-colors"
        >
          <SidebarIcon size={16} />
        </button>
      </div>

      <div className="px-4 pt-5 pb-3">
        <Link
          href="/app/briefs/new"
          className="group flex items-center justify-center gap-2 w-full bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] py-[11px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors shadow-[var(--shadow-sm)]"
        >
          <PlusIcon size={14} className="group-hover:rotate-90 transition-transform duration-200" />
          Nouveau brief
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 text-[13px]">
        <NavItem href="/app" icon={<HouseIcon size={16} />} active={pathname === "/app"}>
          Accueil
        </NavItem>
        <NavItem
          href="/app/briefs"
          icon={<FileTextIcon size={16} />}
          active={pathname === "/app/briefs" || pathname?.startsWith("/app/briefs/")}
        >
          Tous les briefs
        </NavItem>
        <NavItem
          href="/app/folders"
          icon={<FoldersIcon size={16} />}
          active={pathname === "/app/folders" || pathname?.startsWith("/app/folders/")}
        >
          Tous les clients
        </NavItem>

        {favorites.length > 0 && (
          <NavSection title="Favoris">
            {favorites.map((f) => (
              <FolderItem
                key={f.id}
                href={`/app/folders/${f.id}`}
                active={pathname === `/app/folders/${f.id}`}
                website={f.website}
              >
                {f.name}
              </FolderItem>
            ))}
          </NavSection>
        )}

        {isAdmin && (
          <NavSection title="Admin">
            <NavItem
              href="/app/admin/feedback"
              icon={<TrayIcon size={16} />}
              active={pathname?.startsWith("/app/admin/feedback") ?? false}
            >
              Feedback
            </NavItem>
          </NavSection>
        )}
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
            <div className="w-9 h-9 rounded-full bg-[var(--bg-olive-light)] text-[var(--text)] flex items-center justify-center text-[12px] font-semibold shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold truncate leading-tight">
                {user.name}
              </span>
              <span
                className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-[var(--radius-pill)] text-[10px] font-bold tracking-[0.2px] bg-[var(--bg-olive-light)] text-[var(--text)] leading-none"
                title={`Niveau ${user.level} · Voir le détail dans les paramètres`}
              >
                Lv {user.level}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono truncate">
              {user.email}
            </div>
          </div>
          <GearIcon size={16} className="text-[var(--text-muted)] shrink-0" />
        </Link>
        <button
          onClick={onLogout}
          className="mt-2 w-full text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors py-1"
        >
          Déconnexion
        </button>
      </div>
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
      className={`relative flex items-center gap-[10px] pl-[14px] pr-3 py-[8px] rounded-[var(--radius-sm)] transition-colors ${
        active
          ? "bg-[var(--bg-warm)] text-[var(--text)] font-semibold"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-[3px] top-[18%] bottom-[18%] w-[3px] rounded-full bg-[var(--accent-dark)]"
        />
      )}
      <span className={`shrink-0 w-4 h-4 ${active ? "text-[var(--text)]" : ""}`}>{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)]">
        {title}
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
      {favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={favicon}
          alt=""
          width={16}
          height={16}
          className="rounded-[3px] shrink-0 bg-[var(--bg-warm)]"
          loading="lazy"
        />
      ) : (
        <span className="w-4 h-4 rounded-[3px] bg-[var(--bg-warm)] text-[var(--text-muted)] flex items-center justify-center text-[10px] shrink-0">·</span>
      )}
      <span className="truncate">{children}</span>
    </Link>
  );
}
