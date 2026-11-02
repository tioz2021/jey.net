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

const PROTECTED_PREFIXES = ["/items", "/tags", "/dashboard", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    // Behind Caddy the request reaches Next on 127.0.0.1:3000, so the
    // internal origin is not the public one. Public host comes from the
    // forwarded headers; without them the browser would be sent to localhost.
    const loginUrl = publicUrl(request, "/login");
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

function publicUrl(request: NextRequest, path: string): URL {
  const first = (value: string | null) => value?.split(",")[0]?.trim() ?? "";

  const protocol =
    first(request.headers.get("x-forwarded-proto")) ||
    request.nextUrl.protocol.replace(":", "");
  const host =
    first(request.headers.get("x-forwarded-host")) ||
    request.headers.get("host") ||
    request.nextUrl.host;

  return new URL(path, `${protocol}://${host}`);
}

export const config = {
  // `/api` is deliberately absent: the proxy to the Rust server must pass.
  matcher: [
    "/items/:path*",
    "/tags/:path*",
    "/dashboard",
    "/settings/:path*",
  ],
};
