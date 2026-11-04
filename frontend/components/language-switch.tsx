"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { api } from "@/lib/api";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./language-switch.module.css";

const LABELS: Record<Locale, { code: string; name: string }> = {
  ru: { code: "RU", name: "Русский" },
  uk: { code: "UA", name: "Українська" },
  en: { code: "EN", name: "English" },
};

/** A compact menu instead of three buttons, so the header never overflows. */
export function LanguageSwitch() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const { user, setUser } = useUser();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const selected =
      menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
    selected?.focus();
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ??
        [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);

    let next = index;
    if (event.key === "ArrowDown") {
      next = index < 0 ? 0 : (index + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = items.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    items[next]?.focus();
  }

  async function choose(next: Locale) {
    setOpen(false);

    if (next === locale) {
      return;
    }

    setLocale(next);

    if (user) {
      try {
        const response = await api.auth.updateMe({ locale: next });
        setUser(response.user);
      } catch {
        // The cookie already switched the interface; the profile can catch up
        // on the next explicit save.
      }
    }

    router.refresh();
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${t("language.label")}: ${LABELS[locale].code}`}
        aria-controls={menuId}
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span>{LABELS[locale].code}</span>
        <svg
          aria-hidden="true"
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          fill="none"
          height="9"
          viewBox="0 0 24 24"
          width="9"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>

      {open ? (
        <div
          className={styles.menu}
          id={menuId}
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          {SUPPORTED_LOCALES.map((value) => (
            <button
              aria-checked={value === locale}
              className={`${styles.item} ${value === locale ? styles.active : ""}`}
              key={value}
              onClick={() => choose(value)}
              role="menuitemradio"
              type="button"
            >
              <span>{LABELS[value].name}</span>
              <span className={styles.code}>{LABELS[value].code}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
