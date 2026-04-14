import { NextResponse, type NextRequest } from "next/server";

// Better-auth stores its session cookie under `better-auth.session_token`
// (prefixed with `__Secure-` in production https contexts).
const SESSION_COOKIE_CANDIDATES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

export function proxy(req: NextRequest) {
  const hasSession = SESSION_COOKIE_CANDIDATES.some((name) =>
    req.cookies.has(name),
  );

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protect the authenticated app area. Public pages (/, /login, /share/*)
  // stay open.
  matcher: ["/app/:path*"],
};
