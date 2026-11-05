"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Keeps old UUID profile links working while showing the canonical handle URL. */
export function HandleRedirect({ handle }: { handle: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/u/${handle}`);
  }, [handle, router]);

  return null;
}
