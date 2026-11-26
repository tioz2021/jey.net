"use client";

import { AppLink } from "@/lib/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { subscribeToNotifications } from "@/lib/notification-stream";
import type { NotificationItem } from "@/lib/types";

import styles from "./notifications.module.css";

const IS_DESKTOP = typeof window !== "undefined" && "__TAURI__" in window;

export function NotificationsScreen() {
  const { t, date } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const refresh = async () => {
      if (cancelled) return;
      try {
        const response = await api.notifications.list();
        if (cancelled) return;
        setItems(response.items);
        setUnread(response.unread);
        setOpenedAt((current) => current ?? new Date().toISOString());
      } catch {
        // Keep the current list; the next poll retries.
      }
    };

    const schedule = () => {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refresh().finally(schedule);
      }, document.visibilityState === "visible" ? (IS_DESKTOP ? 3_000 : 5_000) : 60_000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh().finally(schedule);
      } else {
        schedule();
      }
    };

    void refresh()
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          schedule();
        }
      });
    const unsubscribe = subscribeToNotifications(() => void refresh());
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function markOneRead(item: NotificationItem) {
    if (item.read) return;
    setItems((current) =>
      current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry),
    );
    setUnread((current) => Math.max(0, current - 1));
    window.dispatchEvent(new Event("jey:notifications-read"));
    try {
      await api.notifications.markRead(item.id);
      window.dispatchEvent(new Event("jey:notifications-read"));
    } catch {
      setItems((current) =>
        current.map((entry) => entry.id === item.id ? { ...entry, read: false } : entry),
      );
      setUnread((current) => current + 1);
      window.dispatchEvent(new Event("jey:notifications-read"));
    }
  }

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
            {items.map((item) => {
              const itemHref =
                item.item_slug && item.item_author_handle
                  ? `/u/${item.item_author_handle}/cart/${item.item_slug}`
                  : `/u/${item.actor_id}`;
              const isComment = item.kind === "comment";
              const isReply = item.kind === "reply";
              const isReaction = item.kind === "reaction";
              const isReport = item.kind === "report";
              return (
              <li
                className={`${styles.item} ${item.read ? "" : styles.unread}`}
                key={item.id}
                onClick={() => void markOneRead(item)}
              >
                <AppLink href={`/u/${item.actor_id}`}>
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
                </AppLink>
                <div>
                  <p className={styles.text}>
                    <AppLink href={`/u/${item.actor_id}`}>{item.actor_name}</AppLink>{" "}
                    {item.kind === "item" && item.item_id ? (
                      <>
                        {t("notifications.addedItem")}{" "}
                        <AppLink href={itemHref}>
                          {item.item_title ?? t("notifications.itemFallback")}
                        </AppLink>
                      </>
                    ) : isComment ? (
                      <>
                        {t("notifications.commented")}{" "}
                        <AppLink href={itemHref}>
                          {item.item_title ?? t("notifications.itemFallback")}
                        </AppLink>
                      </>
                    ) : isReply ? (
                      <>
                        {t("notifications.replied")}{" "}
                        <AppLink href={itemHref}>
                          {item.item_title ?? t("notifications.itemFallback")}
                        </AppLink>
                      </>
                    ) : isReaction ? (
                      <>
                        {item.comment_id
                          ? t("notifications.reactedComment")
                          : t("notifications.reactedItem")}{" "}
                        <AppLink href={itemHref}>
                          {item.item_title ?? t("notifications.itemFallback")}
                        </AppLink>
                      </>
                    ) : isReport ? (
                      <>
                        {t("notifications.reportProcessed")}
                        {item.item_id ? (
                          <>{" "}<AppLink href={itemHref}>{item.item_title ?? t("notifications.itemFallback")}</AppLink></>
                        ) : null}
                      </>
                    ) : (
                      t("notifications.followedYou")
                    )}
                  </p>
                  {item.comment_body && (isComment || isReply || isReaction) ? (
                    <p className={styles.snippet}>«{item.comment_body}»</p>
                  ) : null}
                  <time className={styles.time}>{date(item.created_at)}</time>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </Card>
    </main>
  );
}
