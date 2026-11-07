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
  return window.location.pathname;
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

export function useParams<T extends Record<string, string>>() {
  return {} as T;
}
