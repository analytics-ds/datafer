import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { LoginPreview } from "./preview";

export default function LoginPage() {
  return (
    <main className="min-h-screen grid md:grid-cols-[1fr_480px] lg:grid-cols-[1fr_520px] bg-[var(--bg)]">
      <LoginPreview />
      <div className="flex items-center justify-center px-6 py-12">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
