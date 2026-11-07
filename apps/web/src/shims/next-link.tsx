import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function Link({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  const target = href.startsWith("/") && !href.startsWith("/spa") ? `/spa${href}` : href;
  return <a href={target} {...rest}>{children}</a>;
}
