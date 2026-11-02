"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { useUser } from "@/lib/user-context";

/**
 * Keeps a signed-in visitor off the login and registration pages.
 *
 * Rendered on those pages only: once the session is confirmed, the visitor is
 * sent to `next` (or to the catalogue).
 */
export function RedirectIfAuthenticated() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useUser();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const next = searchParams.get("next");
    const target =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/items";

    router.replace(target);
  }, [loading, user, router, searchParams]);

  return null;
}
