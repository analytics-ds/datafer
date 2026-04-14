import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { PageHeader } from "../_ui";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export default async function SettingsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>Paramètres<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Gère ton profil, ta photo et tes identifiants de connexion."
      />

      <section className="mb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
          Profil
        </h2>
        <ProfileForm
          initial={{
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? "",
          }}
        />
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--red)]" />
          Sécurité
        </h2>
        <PasswordForm />
      </section>
    </div>
  );
}
