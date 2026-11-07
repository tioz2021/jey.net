import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function Link({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (rest.target || rest.download || !href.startsWith("/") || href.startsWith("/api") || href.startsWith("/media")) return;
        const bridge = (window as unknown as { __jeyNavigate?: (value: string) => void }).__jeyNavigate;
        if (!bridge) return;
        event.preventDefault();
        bridge(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
