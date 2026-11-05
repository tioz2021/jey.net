"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Keeps old /u/... card links working while showing the canonical cart URL. */
export function CartRedirect({ slug }: { slug: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/cart/${slug}`);
  }, [router, slug]);

  return null;
}
