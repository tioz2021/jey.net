import type { ViewMode } from "@/components/view-switch";

export function readViewPreference(key: string, fallback: ViewMode = "list"): ViewMode {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value === "list" || value === "grid" ? value : fallback;
}

export function saveViewPreference(key: string, value: ViewMode) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, value);
}
