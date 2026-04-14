import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client, user as userTable } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { Sidebar } from "./sidebar";
import { FirstLoginGate } from "./first-login-gate";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const db = getDb();

  // Flag de changement de mot de passe obligatoire (premier login)
  const [me] = await db
    .select({
      mustChangePassword: userTable.mustChangePassword,
      firstName: userTable.firstName,
      lastName: userTable.lastName,
      image: userTable.image,
    })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  if (me?.mustChangePassword) {
    // Le gate côté client redirige vers /app/first-login sauf si on y est déjà
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <FirstLoginGate />
        {children}
      </div>
    );
  }

  // Dossiers perso : uniquement ceux de l'utilisateur courant
  const personalFolders = await db
    .select({ id: client.id, name: client.name, website: client.website })
    .from(client)
    .where(and(eq(client.ownerId, session.user.id), eq(client.scope, "personal")))
    .orderBy(asc(client.name));

  // Dossiers datashake : partagés (visibles par tous les users authentifiés)
  const agencyFolders = await db
    .select({ id: client.id, name: client.name, website: client.website })
    .from(client)
    .where(eq(client.scope, "agency"))
    .orderBy(asc(client.name));

  const displayName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ") || session.user.name;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      <Sidebar
        user={{
          id: session.user.id,
          email: session.user.email,
          name: displayName,
          image: me?.image ?? null,
        }}
        personalFolders={personalFolders}
        agencyFolders={agencyFolders}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
