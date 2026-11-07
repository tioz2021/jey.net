"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

const SPA_ROUTES = ["/items", "/collections", "/feed", "/recommendations", "/people", "/notifications", "/settings", "/dashboard", "/trash", "/privacy", "/terms", "/login", "/admin"];

export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("/api") && !href.startsWith("/media") && !href.startsWith("/health") && !href.startsWith("//");
}

function navigate(href: string) {
  const bridge = (window as unknown as { __jeyNavigate?: (value: string) => void }).__jeyNavigate;
  if (bridge) bridge(href);
  else window.location.href = href;
}

function withSpaBase(href: string): string {
  return href;
}

/** Minimal navigation boundary shared by Next pages and the Vite SPA. */
export function useAppRouter() {
  return {
    push: (href: string) => { navigate(withSpaBase(href)); },
    replace: (href: string) => {
      const bridge = (window as unknown as { __jeyNavigate?: (value: string) => void }).__jeyNavigate;
      if (bridge) bridge(withSpaBase(href));
      else window.location.replace(withSpaBase(href));
    },
    back: () => { window.history.back(); },
    refresh: () => { window.location.reload(); },
  };
}

export function AppLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  return (
    <a
      href={withSpaBase(href)}
      onClick={(event) => {
        if (rest.target || rest.download || !isInternalHref(href)) {
          rest.onClick?.(event);
          return;
        }
        const bridge = (window as unknown as { __jeyNavigate?: (value: string) => void }).__jeyNavigate;
        if (!bridge) {
          rest.onClick?.(event);
          return;
        }
        event.preventDefault();
        rest.onClick?.(event);
        bridge(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
