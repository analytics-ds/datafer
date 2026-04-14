"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Quand `mustChangePassword` est vrai, tout accès à /app/* doit renvoyer sur
 * /app/first-login sauf si on y est déjà. Ce gate côté client suffit puisque
 * le layout serveur est celui qui décide de le monter ou non.
 */
export function FirstLoginGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/app/first-login") {
      router.replace("/app/first-login");
    }
  }, [pathname, router]);

  return null;
}
