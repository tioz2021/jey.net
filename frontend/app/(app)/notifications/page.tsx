"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { NotificationItem } from "@/lib/types";

import styles from "./notifications.module.css";

export default function NotificationsPage() {
  const { t, date } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.notifications
      .list()
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setUnread(response.unread);
          setOpenedAt(new Date().toISOString());
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function markAllRead() {
    setMarking(true);
    try {
      const response = await api.notifications.markAllRead(openedAt ?? undefined);
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnread(response.unread);
      window.dispatchEvent(new Event("jey:notifications-read"));
    } finally {
      setMarking(false);
    }
  }

  return (
    <main>
      <PageHeader
        action={
          unread > 0 ? (
            <Button loading={marking} onClick={() => void markAllRead()} size="sm">
              {t("notifications.markAll")}
            </Button>
          ) : null
        }
        title={t("notifications.title")}
      />
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
                    {item.kind === "item" && item.item_id ? (
                      <>
                        {t("notifications.addedItem")}{" "}
                        <Link href={`/u/${item.actor_id}/${item.item_id}`}>
                          {item.item_title ?? t("notifications.itemFallback")}
                        </Link>
                      </>
                    ) : (
                      t("notifications.followedYou")
                    )}
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
