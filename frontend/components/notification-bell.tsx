"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { IconBell } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import { playNotificationSound, unlockNotificationSound } from "@/lib/notification-sound";

import styles from "./notification-bell.module.css";

const POLL_VISIBLE_MS = 5_000;
const POLL_HIDDEN_MS = 60_000;

function updateFavicon(count: number) {
  const existing = document.querySelector<HTMLLinkElement>('link[data-jey-badge="1"]');
  if (count <= 0) {
    existing?.remove();
    return;
  }
  const link =
    existing ??
    (() => {
      const element = document.createElement("link");
      element.rel = "icon";
      element.dataset.jeyBadge = "1";
      document.head.appendChild(element);
      return element;
    })();
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#dc2626";
  context.beginPath();
  context.arc(32, 32, 32, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff";
  context.font = "bold 30px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(count > 9 ? "9+" : String(count), 32, 35);
  link.href = canvas.toDataURL("image/png");
}

export function NotificationBell() {
  const { user } = useUser();
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: number | null = null;
    let blinkTimer: number | null = null;
    let previousUnread: number | null = null;
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "").replace(/^●\s*/, "");

    const stopBlink = () => {
      if (blinkTimer) {
        window.clearInterval(blinkTimer);
        blinkTimer = null;
      }
    };

    const showTitle = (count: number) => {
      stopBlink();
      if (count <= 0) {
        document.title = baseTitle;
        return;
      }
      if (document.visibilityState === "visible") {
        document.title = `(${count}) ${baseTitle}`;
        return;
      }
      let visible = false;
      document.title = `(${count}) ${baseTitle}`;
      blinkTimer = window.setInterval(() => {
        visible = !visible;
        document.title = visible ? `● ${baseTitle}` : `(${count}) ${baseTitle}`;
      }, 1200);
    };

    const clearTimer = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (cancelled) return;
      timer = window.setTimeout(
        () => void load(),
        document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS,
      );
    };

    async function load() {
      try {
        const response = await api.notifications.list();
        const chat = await api.chat.threads().catch(() => null);
        if (cancelled) return;
        if (previousUnread !== null && response.unread > previousUnread) {
          void playNotificationSound();
        }
        previousUnread = response.unread;
        setUnread(response.unread);
        const chatUnread = chat
          ? chat.threads
              .filter((thread) => !thread.muted)
              .reduce((sum, thread) => sum + thread.unread, 0)
          : 0;
        updateFavicon(response.unread);
        showTitle(response.unread + chatUnread);
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
        schedule();
      }
    };
    const onRead = () => void load();
    const onChatUpdated = () => void load();
    const onNotification = () => {
      window.dispatchEvent(new Event("jey:notification"));
      void load();
    };
    // Live signal; the interval below remains the fallback if SSE is blocked.
    const source = typeof EventSource === "undefined"
      ? null
      : new EventSource("/api/v1/notifications/stream");
    source?.addEventListener("notification", onNotification);
    source?.addEventListener("resync", onNotification);
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "jey:notification") void load();
    };
    void load();
    window.addEventListener("jey:notifications-read", onRead);
    window.addEventListener("jey:chat-updated", onChatUpdated);
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", unlockNotificationSound, { once: true });
    window.addEventListener("keydown", unlockNotificationSound, { once: true });
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      cancelled = true;
      clearTimer();
      stopBlink();
      document.title = baseTitle;
      updateFavicon(0);
      source?.close();
      window.removeEventListener("jey:notifications-read", onRead);
      window.removeEventListener("jey:chat-updated", onChatUpdated);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", unlockNotificationSound);
      window.removeEventListener("keydown", unlockNotificationSound);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
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
