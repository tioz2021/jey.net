import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function Link({
  href,
  children,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (rest.target || rest.download || !href.startsWith("/") || href.startsWith("/api") || href.startsWith("/media")) return;
        const bridge = (window as unknown as { __jeyNavigate?: (value: string) => void }).__jeyNavigate;
        if (!bridge) return;
        event.preventDefault();
        bridge(href);
      }}
    >
      {children}
    </a>
  );
}
