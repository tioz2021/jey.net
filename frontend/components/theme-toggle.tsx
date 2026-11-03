"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/lib/locale-context";

import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";

const STORAGE_KEY = "jey-theme";

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const initial: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : media.matches
          ? "dark"
          : "light";

    setTheme(initial);
    document.documentElement.dataset.theme = initial;

    // Until the person makes an explicit choice, follow the browser live.
    function onSystemChange(event: MediaQueryListEvent) {
      const chosen = window.localStorage.getItem(STORAGE_KEY);
      if (chosen === "light" || chosen === "dark") {
        return;
      }

      const next: Theme = event.matches ? "dark" : "light";
      setTheme(next);
      document.documentElement.dataset.theme = next;
    }

    media.addEventListener("change", onSystemChange);

    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const label = theme === "dark" ? t("theme.light") : t("theme.dark");

  return (
    <button
      aria-label={label}
      className={styles.button}
      onClick={toggle}
      title={label}
      type="button"
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
