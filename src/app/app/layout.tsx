import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client, folderFavorite, user as userTable } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Sidebar } from "./sidebar";
import { FirstLoginGate } from "./first-login-gate";
import { EasterEgg } from "./easter-egg";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { levelFromXp } from "@/lib/xp";
import { LocaleProvider } from "@/lib/i18n/context";
import { resolveLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Côté consultant il n'y a pas de dossier au niveau du layout : la langue
  // vient du cookie posé par le sélecteur, sinon français.
  const locale = await resolveLocale();

  const db = getDb();

  const [me] = await db
    .select({
      mustChangePassword: userTable.mustChangePassword,
      firstName: userTable.firstName,
      lastName: userTable.lastName,
      image: userTable.image,
      totalXp: userTable.totalXp,
    })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  if (me?.mustChangePassword) {
    return (
      <LocaleProvider locale={locale}>
        <div className="min-h-screen bg-[var(--bg)]">
          <EasterEgg />
          <FirstLoginGate />
          {children}
        </div>
      </LocaleProvider>
    );
  }

  // Favoris de l'utilisateur courant (visibles dans la sidebar)
  const favorites = await db
    .select({ id: client.id, name: client.name, website: client.website })
    .from(folderFavorite)
    .innerJoin(client, eq(client.id, folderFavorite.folderId))
    .where(eq(folderFavorite.userId, session.user.id))
    .orderBy(asc(client.name));

  const displayName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ") || session.user.name;

  return (
    <LocaleProvider locale={locale}>
      <div className="min-h-screen bg-[var(--bg)] flex">
        <EasterEgg />
        <Sidebar
          user={{
            id: session.user.id,
            email: session.user.email,
            name: displayName,
            image: me?.image ?? null,
            level: levelFromXp(me?.totalXp ?? 0).level,
          }}
          favorites={favorites}
          isAdmin={session.user.email.toLowerCase() === "pierre@datashake.fr"}
        />
        <main className="flex-1 min-w-0">{children}</main>
        <FeedbackWidget />
      </div>
    </LocaleProvider>
  );
}
