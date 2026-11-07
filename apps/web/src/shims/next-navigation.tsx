import { useEffect, useState } from "react";

function currentPathname() {
  return window.location.pathname.replace(/^\/spa/, "") || "/";
}

export function useRouter() {
  return {
    push: (href: string) => { window.location.href = href; },
    replace: (href: string) => { window.location.replace(href); },
    back: () => window.history.back(),
    refresh: () => window.location.reload(),
    prefetch: () => {},
  };
}

export function usePathname() {
  const [pathname, setPathname] = useState(currentPathname);
  useEffect(() => {
    const sync = () => setPathname(currentPathname());
    window.addEventListener("popstate", sync);
    window.addEventListener("jey:route-changed", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("jey:route-changed", sync);
    };
  }, []);
  return pathname;
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

export function useParams<T extends Record<string, string>>() {
  return {} as T;
}
