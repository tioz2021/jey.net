import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

/**
 * Keeps the public card URL pretty: /cart/<slug> is rendered by the existing
 * /u/<handle>/<id> page without changing the address bar.
 */
export async function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/cart\/([^/]+)$/);
  if (!match?.[1]) return NextResponse.next();

  const response = await fetch(
    `${BACKEND_URL}/api/v1/public/cart/${encodeURIComponent(match[1])}`,
    { cache: "no-store" },
  );
  if (!response.ok) return NextResponse.next();
  const data = (await response.json()) as {
    user_id: string;
    item_id: string;
    handle: string;
  };

  const url = request.nextUrl.clone();
  // Next standalone behind Caddy otherwise builds an https://localhost URL and
  // tries to proxy it with TLS to the plain HTTP web process.
  url.protocol = "http:";
  url.hostname = "127.0.0.1";
  url.port = process.env.PORT ?? "3000";
  // The existing public item endpoint keys the owner by UUID; the URL in
  // the address bar stays /cart/<slug>.
  url.pathname = `/u/${data.user_id}/${data.item_id}`;
  const headers = new Headers(request.headers);
  headers.set("x-jey-cart", "1");
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/cart/:path*"],
};
