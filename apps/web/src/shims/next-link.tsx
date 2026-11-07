import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function Link({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  const routes = ["/items", "/collections", "/feed", "/recommendations", "/people", "/notifications", "/settings", "/dashboard", "/trash", "/privacy", "/terms", "/login", "/admin"];
  const target = routes.some((route) => href === route || href.startsWith(`${route}/`) || href.startsWith(`${route}?`)) && !href.startsWith("/spa") ? `/spa${href}` : href;
  return <a href={target} {...rest}>{children}</a>;
}
