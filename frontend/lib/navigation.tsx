"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

/** Minimal navigation boundary shared by Next pages and the Vite SPA. */
export function useAppRouter() {
  return {
    push: (href: string) => { window.location.href = href; },
    replace: (href: string) => { window.location.replace(href); },
    back: () => { window.history.back(); },
    refresh: () => { window.location.reload(); },
  };
}

export function AppLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  return <a href={href} {...rest}>{children}</a>;
}
