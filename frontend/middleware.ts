import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";
const ITEM_PATH = /^\/u\/([^/]+)\/item\/([^/]+)$/;
const ITEM_EDIT_PATH = /^\/u\/([^/]+)\/item\/([^/]+)\/edit$/;
const OWNER_CART_PATH = /^\/u\/([^/]+)\/cart\/([^/]+)$/;
const CART_PATH = /^\/cart\/([^/]+)$/;

function externalUrl(request: NextRequest, pathname: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  return new URL(pathname, `${protocol}://${host}`);
}

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
  const editMatch = pathname.match(ITEM_EDIT_PATH);
  const ownerCartMatch = pathname.match(OWNER_CART_PATH);
  const cartMatch = pathname.match(CART_PATH);

  if (ownerCartMatch?.[1] && ownerCartMatch[2]) {
    return NextResponse.redirect(
      externalUrl(
        request,
        `/u/${encodeURIComponent(ownerCartMatch[1])}/item/${ownerCartMatch[2]}`,
      ),
      308,
    );
  }

  if (editMatch?.[2]) {
    const slug = editMatch[2];
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
        return NextResponse.rewrite(
          internalUrl(request, `/items/${body.item.id}/edit`),
          { request: { headers } },
        );
      }
    }
    return NextResponse.next();
  }

  if (itemMatch?.[1] && itemMatch[2]) {
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
      `${BACKEND_URL}/api/v1/public/users/${encodeURIComponent(itemMatch[1])}/items/by-slug/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (publicResponse.ok) {
      const data = (await publicResponse.json()) as {
        user_id: string;
        item_id: string;
      };
      const headers = new Headers(request.headers);
      headers.set("x-jey-cart", "1");
      headers.set("x-jey-canonical", pathname);
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
      return NextResponse.redirect(
        externalUrl(
          request,
          `/u/${encodeURIComponent(data.handle)}/item/${cartMatch[1]}`,
        ),
        308,
      );
    }
    return NextResponse.next();
  }

  const legacyEdit = pathname.match(
    /^\/items\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/edit$/,
  );
  if (legacyEdit?.[1] && request.headers.get("x-jey-item") !== "1") {
    const cookie = request.headers.get("cookie") ?? "";
    const itemResponse = await fetch(
      `${BACKEND_URL}/api/v1/items/${legacyEdit[1]}`,
      { cache: "no-store", headers: { cookie } },
    );
    const meResponse = await fetch(`${BACKEND_URL}/api/v1/me`, {
      cache: "no-store",
      headers: { cookie },
    });
    if (itemResponse.ok && meResponse.ok) {
      const { item } = (await itemResponse.json()) as { item?: { slug?: string } };
      const { user } = (await meResponse.json()) as { user?: { handle?: string } };
      if (item?.slug && user?.handle) {
        return NextResponse.redirect(
          externalUrl(request, `/u/${user.handle}/item/${item.slug}/edit`),
          307,
        );
      }
    }
  }

  const legacyItem = pathname.match(
    /^\/items\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  );
  if (legacyItem?.[1] && request.headers.get("x-jey-item") !== "1") {
    const cookie = request.headers.get("cookie") ?? "";
    const itemResponse = await fetch(
      `${BACKEND_URL}/api/v1/items/${legacyItem[1]}`,
      { cache: "no-store", headers: { cookie } },
    );
    const meResponse = await fetch(`${BACKEND_URL}/api/v1/me`, {
      cache: "no-store",
      headers: { cookie },
    });
    if (itemResponse.ok && meResponse.ok) {
      const { item } = (await itemResponse.json()) as {
        item?: { slug?: string };
      };
      const { user } = (await meResponse.json()) as {
        user?: { handle?: string };
      };
      if (item?.slug && user?.handle) {
        return NextResponse.redirect(
          externalUrl(request, `/u/${user.handle}/item/${item.slug}`),
          307,
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/u/:path*", "/cart/:path*", "/items/:path*"],
};
