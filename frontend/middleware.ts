import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Cheap gate for private pages: a request without a session cookie never
 * reaches them.
 *
 * Whether the session is still valid is checked in the `(app)` layout against
 * the API — middleware only looks at the cookie, which keeps it fast and
 * independent of the backend.
 */

const SESSION_COOKIE = "jey_session";

const PROTECTED_PREFIXES = ["/items", "/tags", "/stats", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // `/api` is deliberately absent: the proxy to the Rust server must pass.
  matcher: ["/items/:path*", "/tags/:path*", "/stats/:path*", "/settings/:path*"],
};
