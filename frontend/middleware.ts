import { NextResponse, type NextRequest } from "next/server";

import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

/**
 * Allows shareable, crawlable language links (`?lang=uk`) while the regular
 * switch keeps the choice in a cookie. The query is not removed: the rendered
 * page must stay in that language for a crawler without cookies.
 */
export function middleware(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("lang");

  if (!isLocale(requested)) {
    return NextResponse.next();
  }

  request.cookies.set(LOCALE_COOKIE, requested);
  const response = NextResponse.next({ request });
  response.cookies.set(LOCALE_COOKIE, requested, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|screenshots|media|api).*)"],
};
