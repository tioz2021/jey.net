"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

const SPA_ROUTES = ["/items", "/collections", "/feed", "/recommendations", "/people", "/notifications", "/settings", "/dashboard", "/trash", "/privacy", "/terms", "/login", "/admin"];

function withSpaBase(href: string): string {
  return href;
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
