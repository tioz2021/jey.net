"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  IconList,
  IconPeople,
  IconSettings,
  IconStats,
} from "@/components/icons";
import { Avatar } from "@/components/profile/avatar";
import { LanguageSwitch } from "@/components/language-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import type { User } from "@/lib/types";

import styles from "./user-menu.module.css";
import { mediaUrl } from "@/lib/media";

export function UserMenu({
  user,
  compact = false,
  menuAlign = "right",
}: {
  user: User;
  compact?: boolean;
  menuAlign?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser } = useUser();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuUp, setMenuUp] = useState(false);
  const [pending, setPending] = useState(false);
  const desktop = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const below = window.innerHeight - trigger.getBoundingClientRect().bottom;
    setMenuUp(below < menu.offsetHeight + 12);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]',
    );
    first?.focus();
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
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

  async function handleLogout() {
    setPending(true);

    try {
      await api.auth.logout();
    } catch {
      // The session may already be gone; clearing local state is enough.
    }

    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="user-menu"
        className={`${styles.trigger} ${compact ? styles.triggerCompact : ""}`}
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
        <Avatar
          url={user.avatar_key ? mediaUrl(user.avatar_key) : null}
          name={user.display_name}
          size={34}
        />
        {compact ? null : <span className={styles.name}>{user.display_name}</span>}
        <svg
          aria-hidden="true"
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""} ${compact ? styles.chevronHidden : ""}`}
          fill="none"
          height="10"
          viewBox="0 0 24 24"
          width="10"
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          className={`${styles.menu} ${menuUp ? styles.menuUp : ""} ${menuAlign === "left" ? styles.menuLeft : ""}`}
          id="user-menu"
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          <Link className={styles.menuUser} href={`/u/${user.handle}`}>
            <Avatar
              url={user.avatar_key ? mediaUrl(user.avatar_key) : null}
              name={user.display_name}
              size={30}
            />
            <span className={styles.menuUserText}>
              <strong>{user.display_name}</strong>
              <small>{user.role === "user" ? "Trial" : user.role}</small>
            </span>
            <span aria-hidden="true" className={styles.menuUserArrow}>›</span>
          </Link>
          <Link className={styles.item} href={`/u/${user.handle}`} role="menuitem">
            <IconList size={15} />
            {t("account.myPage")}
          </Link>
          {desktop ? (
            <a className={styles.item} href={`https://j3ynet.site${user.handle === "local" ? "" : `/u/${user.handle}`}`} rel="noreferrer" role="menuitem" target="_blank">
              {t("account.webVersion")} ↗
            </a>
          ) : null}
          <Link className={styles.item} href="/dashboard" role="menuitem">
            <IconStats size={15} />
            {t("account.stats")}
          </Link>
          <Link className={styles.item} href="/settings" role="menuitem">
            <IconSettings size={15} />
            {t("account.settings")}
          </Link>
          {user.role !== "user" ? (
            <Link className={styles.item} href="/admin" role="menuitem">
              <IconPeople size={15} />
              {t("account.admin")}
            </Link>
          ) : null}
          <div className={styles.settings}>
            <ThemeToggle />
            <LanguageSwitch />
          </div>
          <button
            className={`${styles.item} ${styles.danger}`}
            disabled={pending}
            onClick={handleLogout}
            role="menuitem"
            type="button"
          >
            {pending ? `${t("account.logout")}…` : t("account.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
