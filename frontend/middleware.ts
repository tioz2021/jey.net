import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";
const ITEM_PATH = /^\/u\/([^/]+)\/item\/([^/]+)$/;
const CART_PATH = /^\/cart\/([^/]+)$/;

function internalUrl(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.protocol = "http:";
  url.hostname = "127.0.0.1";
  url.port = process.env.PORT ?? "3000";
  url.pathname = pathname;
  return url;
}

/**
 * Pretty item URLs:
 *   /u/<handle>/item/<slug>  private owner or public card
 *   /cart/<slug>             legacy redirect
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const itemMatch = pathname.match(ITEM_PATH);
  const cartMatch = pathname.match(CART_PATH);

  if (itemMatch?.[2]) {
    const slug = itemMatch[2];
    const privateResponse = await fetch(
      `${BACKEND_URL}/api/v1/items/by-slug/${encodeURIComponent(slug)}`,
      {
        cache: "no-store",
        headers: { cookie: request.headers.get("cookie") ?? "" },
      },
    );
    if (privateResponse.ok) {
      const body = (await privateResponse.json()) as { item?: { id?: string } };
      if (body.item?.id) {
        const headers = new Headers(request.headers);
        headers.set("x-jey-item", "1");
        return NextResponse.rewrite(internalUrl(request, `/items/${body.item.id}`), {
          request: { headers },
        });
      }
    }

    const publicResponse = await fetch(
      `${BACKEND_URL}/api/v1/public/cart/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (publicResponse.ok) {
      const data = (await publicResponse.json()) as {
        user_id: string;
        item_id: string;
      };
      const headers = new Headers(request.headers);
      headers.set("x-jey-cart", "1");
      return NextResponse.rewrite(
        internalUrl(request, `/u/${data.user_id}/${data.item_id}`),
        { request: { headers } },
      );
    }
    return NextResponse.next();
  }

  if (cartMatch?.[1]) {
    const response = await fetch(
      `${BACKEND_URL}/api/v1/public/cart/${encodeURIComponent(cartMatch[1])}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const data = (await response.json()) as { handle: string };
      const target = request.nextUrl.clone();
      target.pathname = `/u/${encodeURIComponent(data.handle)}/item/${cartMatch[1]}`;
      return NextResponse.redirect(target, 308);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/u/:path*", "/cart/:path*"],
};
