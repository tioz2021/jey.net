"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { Avatar } from "@/components/profile/avatar";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import type { User } from "@/lib/types";

import styles from "./user-menu.module.css";

export function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser } = useUser();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
        <Avatar
          url={user.avatar_key ? `/media/${user.avatar_key}` : null}
          name={user.display_name}
          size={34}
        />
        <span className={styles.name}>{user.display_name}</span>
        <svg
          aria-hidden="true"
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
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
          className={styles.menu}
          id="user-menu"
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          <Link className={styles.item} href={`/u/${user.id}`} role="menuitem">
            {t("account.myPage")}
          </Link>
          <Link className={styles.item} href="/settings" role="menuitem">
            {t("account.settings")}
          </Link>
          <Link className={styles.item} href="/dashboard" role="menuitem">
            {t("account.stats")}
          </Link>
          {user.is_admin ? (
            <Link className={styles.item} href="/admin" role="menuitem">
              {t("account.admin")}
            </Link>
          ) : null}
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
