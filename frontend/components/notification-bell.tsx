"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { IconBell } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./notification-bell.module.css";

export function NotificationBell() {
  const { user } = useUser();
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: number | null = null;
    const POLL_MS = 30_000;

    const clearTimer = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (cancelled || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => void load(), POLL_MS);
    };

    async function load() {
      try {
        const response = await api.notifications.list();
        if (!cancelled) setUnread(response.unread);
      } catch {
        // Keep the last known count; the next poll will retry.
      } finally {
        schedule();
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        clearTimer();
        void load();
      } else {
        clearTimer();
      }
    };
    const onRead = () => void load();

    void load();
    window.addEventListener("jey:notifications-read", onRead);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener("jey:notifications-read", onRead);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [user]);

  if (!user) return null;

  return (
    <Link
      aria-label={t("notifications.title")}
      className={styles.link}
      href="/notifications"
      title={t("notifications.title")}
    >
      <IconBell size={16} />
      {unread > 0 ? (
        <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span>
      ) : null}
    </Link>
  );
}
