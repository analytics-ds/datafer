import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="h-14 border-b border-neutral-200 bg-white px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold tracking-tight">Datafer</span>
          <span className="text-xs text-neutral-400">par datashake</span>
        </div>
        <div className="text-sm text-neutral-600">
          {session.user.email}
        </div>
      </header>
      {children}
    </div>
  );
}
