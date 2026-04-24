import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { apiKey, user as userTable } from "@/db/schema";
import { PageHeader } from "../_ui";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { ApiKeysForm } from "./api-keys-form";
import { ApiDocs } from "./api-docs";

export default async function SettingsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const [me] = await db
    .select({ firstName: userTable.firstName, lastName: userTable.lastName })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

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
        title={<>Paramètres<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Gère ton profil, tes identifiants et tes clés API."
      />

      <section className="mb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
          Profil
        </h2>
        <ProfileForm initial={{ firstName, lastName, email: session.user.email }} />
      </section>

      <section className="mb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--red)]" />
          Sécurité
        </h2>
        <PasswordForm />
      </section>

      <section className="mb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
          Clés API
        </h2>
        <ApiKeysForm keys={keys} />
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
          Documentation API
        </h2>
        <ApiDocs />
      </section>
    </div>
  );
}
