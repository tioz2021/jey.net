/** RestoreButton is imported by ItemCard but never rendered in the desktop list. */
export function useRouter() {
  return { refresh() {}, push() {}, replace() {} };
}

export function usePathname() {
  return "/";
}
