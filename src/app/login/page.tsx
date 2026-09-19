import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { LoginPreview } from "./preview";
import { LocaleProvider } from "@/lib/i18n/context";
import { resolveLocale } from "@/lib/i18n/server";

export default async function LoginPage() {
  // Pas de dossier ici : seul le cookie du sélecteur peut changer la langue.
  const locale = await resolveLocale();
  return (
    <LocaleProvider locale={locale}>
      <main className="min-h-screen grid md:grid-cols-[1fr_480px] lg:grid-cols-[1fr_520px] bg-[var(--bg)]">
        <LoginPreview />
        <div className="flex items-center justify-center px-6 py-12">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </LocaleProvider>
  );
}
