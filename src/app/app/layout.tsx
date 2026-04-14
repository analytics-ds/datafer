import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { Sidebar } from "./sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const db = getDb();

  // Dossiers perso : uniquement ceux de l'utilisateur courant
  const personalFolders = await db
    .select({ id: client.id, name: client.name, color: client.color })
    .from(client)
    .where(and(eq(client.ownerId, session.user.id), eq(client.scope, "personal")))
    .orderBy(asc(client.name));

  // Dossiers datashake : partagés (visibles par tous les users authentifiés)
  const agencyFolders = await db
    .select({ id: client.id, name: client.name, color: client.color })
    .from(client)
    .where(eq(client.scope, "agency"))
    .orderBy(asc(client.name));

  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      <Sidebar
        user={{
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          image: session.user.image ?? null,
        }}
        personalFolders={personalFolders}
        agencyFolders={agencyFolders}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
