"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

function withSpaBase(href: string): string {
  if (!href.startsWith("/") || href.startsWith("/spa")) return href;
  return window.location.pathname.startsWith("/spa") ? `/spa${href}` : href;
}

/** Minimal navigation boundary shared by Next pages and the Vite SPA. */
export function useAppRouter() {
  return {
    push: (href: string) => { window.location.href = withSpaBase(href); },
    replace: (href: string) => { window.location.replace(withSpaBase(href)); },
    back: () => { window.history.back(); },
    refresh: () => { window.location.reload(); },
  };
}

export function AppLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  return <a href={withSpaBase(href)} {...rest}>{children}</a>;
}
