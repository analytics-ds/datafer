import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { apiKey, brief, user as userTable } from "@/db/schema";
import { PageHeader } from "../_ui";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { ApiKeysForm } from "./api-keys-form";
import { LevelCard } from "./level-card";
import { resolveLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n";
import {
  levelFromXp,
  parseXpAwarded,
  XP_ABOVE_BEST,
  XP_ABOVE_MEDIAN,
  XP_BRIEF_CREATED,
} from "@/lib/xp";

export default async function SettingsPage() {
  const locale = await resolveLocale();
  const t = createTranslator(locale);
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const db = getDb();
  const [me] = await db
    .select({
      firstName: userTable.firstName,
      lastName: userTable.lastName,
      totalXp: userTable.totalXp,
    })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  // Breakdown XP : on parcourt les briefs de l'utilisateur pour compter
  // les awards par catégorie. La somme reflète toujours user.totalXp
  // (idempotence des flags), c'est juste pour l'affichage détaillé.
  const myBriefs = await db
    .select({ xpAwarded: brief.xpAwarded })
    .from(brief)
    .where(eq(brief.ownerId, session.user.id));

  let nCreated = 0;
  let nAboveMedian = 0;
  let nAboveBest = 0;
  for (const b of myBriefs) {
    const flags = parseXpAwarded(b.xpAwarded);
    if (flags.created) nCreated++;
    if (flags.aboveMedian) nAboveMedian++;
    if (flags.aboveBest) nAboveBest++;
  }
  const totalXp = me?.totalXp ?? 0;
  const lvl = levelFromXp(totalXp);

  // Top 5 du classement global (lifetime XP) pour le contexte
  const topUsers = await db
    .select({
      id: userTable.id,
      firstName: userTable.firstName,
      name: userTable.name,
      image: userTable.image,
      totalXp: userTable.totalXp,
    })
    .from(userTable)
    .orderBy(sql`${userTable.totalXp} DESC`)
    .limit(5);

  const parts = (session.user.name || "").split(" ");
  const firstName = me?.firstName ?? parts[0] ?? "";
  const lastName = me?.lastName ?? parts.slice(1).join(" ") ?? "";

  const keys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
    })
    .from(apiKey)
    .where(and(eq(apiKey.userId, session.user.id), isNull(apiKey.revokedAt)))
    .orderBy(apiKey.createdAt);

  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>{t("settings.title")}<span className="df-accent">.</span></>}
        subtitle={t("settings.subtitle")}
      />

      <section className="mb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent-dark)]" />
          {t("settings.level")}
        </h2>
        <LevelCard
          t={t}
          locale={locale}
          totalXp={totalXp}
          level={lvl.level}
          xpInLevel={lvl.xpInLevel}
          xpToNextLevel={lvl.xpToNextLevel}
          currentLevelAt={lvl.currentLevelAt}
          nextLevelAt={lvl.nextLevelAt}
          nCreated={nCreated}
          nAboveMedian={nAboveMedian}
          nAboveBest={nAboveBest}
          xpRules={{
            created: XP_BRIEF_CREATED,
            aboveMedian: XP_ABOVE_MEDIAN,
            aboveBest: XP_ABOVE_BEST,
          }}
          topUsers={topUsers.map((u) => ({
            id: u.id,
            name: u.firstName ?? u.name,
            image: u.image,
            xp: u.totalXp,
            level: levelFromXp(u.totalXp).level,
          }))}
          meId={session.user.id}
        />
      </section>

      <section className="mb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
          {t("settings.profile")}
        </h2>
        <ProfileForm initial={{ firstName, lastName, email: session.user.email }} />
      </section>

      <section className="mb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--brand-blue)]" />
          {t("settings.security")}
        </h2>
        <PasswordForm />
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] flex items-center gap-2">
            <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
            {t("settings.apiKeys")}
          </h2>
          <Link
            href="/app/settings/api-docs"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            {t("settings.viewDocs")}
          </Link>
        </div>
        <ApiKeysForm keys={keys} />
      </section>
    </div>
  );
}
