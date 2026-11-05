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
    const load = () => {
      api.notifications
        .list()
        .then((response) => {
          if (!cancelled) setUnread(response.unread);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("jey:notifications-read", load);
    return () => {
      cancelled = true;
      window.removeEventListener("jey:notifications-read", load);
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
