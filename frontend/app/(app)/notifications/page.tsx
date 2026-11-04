"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { NotificationItem } from "@/lib/types";

import styles from "./notifications.module.css";

export default function NotificationsPage() {
  const { t, date } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.notifications
      .list()
      .then((response) => {
        if (!cancelled) setItems(response.items);
        return api.notifications.markAllRead().then(() => {
          window.dispatchEvent(new Event("jey:notifications-read"));
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <PageHeader title={t("notifications.title")} />
      <Card>
        {!loading && items.length === 0 ? (
          <EmptyState
            text={t("notifications.emptyText")}
            title={t("notifications.emptyTitle")}
          />
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li className={`${styles.item} ${item.read ? "" : styles.unread}`} key={item.id}>
                <Link href={`/u/${item.actor_id}`}>
                  {item.actor_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local avatar
                    <img
                      alt=""
                      className={styles.image}
                      src={`/media/${item.actor_avatar}`}
                    />
                  ) : (
                    <span aria-hidden="true" className={styles.initial}>
                      {item.actor_name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>
                <div>
                  <p className={styles.text}>
                    <Link href={`/u/${item.actor_id}`}>{item.actor_name}</Link>{" "}
                    {t("notifications.followedYou")}
                  </p>
                  <time className={styles.time}>{date(item.created_at)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
