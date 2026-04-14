import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="h-14 bg-[var(--bg-card)] border-b border-[var(--border)] px-7 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-5">
          <div className="ds-logo text-[var(--text)]">
            <div className="ds-logo-mark">
              <div className="sq sq1" />
              <div className="sq sq2" />
            </div>
            <span className="ds-logo-name">datashake</span>
          </div>
          <div className="w-px h-6 bg-[var(--border)]" />
          <span className="font-semibold text-[14px] tracking-[-0.2px]">Datafer</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-[5px] px-3 py-1 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[11px] font-semibold tracking-[0.4px]">
            GEO
          </span>
          <span className="text-[12px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
            {session.user.email}
          </span>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
