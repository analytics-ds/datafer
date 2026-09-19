import { NextResponse } from "next/server";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
} from "@/lib/i18n/types";

/**
 * Pose le cookie de langue. Volontairement sans auth : un client externe qui
 * ouvre un lien /share/<token> n'a pas de compte et doit quand même pouvoir
 * basculer FR/EN. Le cookie ne porte qu'une préférence d'affichage, aucune
 * donnée sensible, et sa valeur est validée contre la liste des locales.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { locale?: unknown } | null;
  const locale = body?.locale;

  if (!isLocale(locale)) {
    return NextResponse.json({ error: "unsupported locale" }, { status: 400 });
  }

  const res = NextResponse.json({ locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  });
  return res;
}
