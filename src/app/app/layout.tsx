import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Sidebar } from "./sidebar";
import { FirstLoginGate } from "./first-login-gate";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const db = getDb();

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
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <FirstLoginGate />
        {children}
      </div>
    );
  }

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
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
