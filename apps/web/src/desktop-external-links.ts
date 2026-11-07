/** Open external anchors in the system browser from the Tauri WebView. */
export function installDesktopExternalLinks() {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T> } } }).__TAURI__;
  const invoke = api?.core?.invoke;
  if (!invoke) return;

  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href.startsWith("http://") && !href.startsWith("https://")) return;
    if (anchor.hasAttribute("download")) return;
    event.preventDefault();
    void invoke("local_open_external", { url: href }).catch((error) => {
      console.error("open external link failed", error);
    });
  }, true);
}
