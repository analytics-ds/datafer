"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();

  async function onClick() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors px-2 py-1"
    >
      Déconnexion
    </button>
  );
}
