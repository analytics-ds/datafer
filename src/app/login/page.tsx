import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4 py-12">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
