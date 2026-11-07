/** In Tauri the web server is not the origin, so media URLs are absolute. */
export function mediaUrl(key: string | null | undefined): string {
  if (!key) return "";
  const desktop = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
  return desktop ? `https://j3ynet.site/media/${key}` : `/media/${key}`;
}

/** API image endpoints are relative to the server in Tauri. */
export function apiAsset(path: string): string {
  const desktop = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
  return desktop ? `https://j3ynet.site${path}` : path;
}
