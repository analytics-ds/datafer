import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { user as userTable } from "@/db/schema";
import { FirstLoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function FirstLoginPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Si l'utilisateur n'a plus le flag, inutile de rester sur cette page
  const db = getDb();
  const [me] = await db
    .select({ mustChangePassword: userTable.mustChangePassword })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  if (!me?.mustChangePassword) redirect("/app");

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4 py-12">
      <div className="w-full max-w-[460px]">
        <span className="inline-flex items-center px-3 py-1 bg-[var(--orange-bg)] text-[var(--orange)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.6px] uppercase mb-5">
          Premier login
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-[40px] leading-[1.05] tracking-[-1px] mb-2">
          Choisis ton mot de passe<span className="italic text-[var(--accent-dark)]">.</span>
        </h1>
        <p className="text-[var(--text-secondary)] text-[14px] leading-[1.55] mb-8">
          Ton compte a été créé avec un mot de passe temporaire. Définis-en un nouveau
          pour continuer.
        </p>

        <FirstLoginForm />
      </div>
    </main>
  );
}
