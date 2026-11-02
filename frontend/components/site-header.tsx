"use client";

import Link from "next/link";

import { useUser } from "@/lib/user-context";

import { LogoutButton } from "./logout-button";
import styles from "./site-header.module.css";

export function SiteHeader() {
  const { user, loading } = useUser();

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/items">
        jey
      </Link>

      <div className={styles.right}>
        {loading ? null : user ? (
          <>
            <span className={styles.name}>{user.display_name}</span>
            <LogoutButton />
          </>
        ) : (
          <Link className={styles.link} href="/login">
            Войти
          </Link>
        )}
      </div>
    </header>
  );
}
