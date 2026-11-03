"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/profile/avatar";
import { api } from "@/lib/api";
import { useUser } from "@/lib/user-context";
import type { User } from "@/lib/types";

import styles from "./user-menu.module.css";

export function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser } = useUser();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Avatar
          url={user.avatar_key ? `/media/${user.avatar_key}` : null}
          name={user.display_name}
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
        <div className={styles.menu} role="menu">
          {user.is_public ? (
            <Link
              className={styles.item}
              href={`/u/${user.id}`}
              role="menuitem"
            >
              Моя страница
            </Link>
          ) : null}
          <Link className={styles.item} href="/settings" role="menuitem">
            Настройки
          </Link>
          <button
            className={`${styles.item} ${styles.danger}`}
            disabled={pending}
            onClick={handleLogout}
            role="menuitem"
            type="button"
          >
            {pending ? "Выходим…" : "Выйти"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
