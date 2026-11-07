"use client";

import { useEffect } from "react";

export function AdminRedirect({ target }: { target: string }) {
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return <main><p>Перенаправление…</p></main>;
}
