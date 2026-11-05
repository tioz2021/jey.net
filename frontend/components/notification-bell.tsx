"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { IconBell } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./notification-bell.module.css";

const POLL_VISIBLE_MS = 30_000;
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

function playTone(context: AudioContext) {
  if (context.state !== "running") return;
  const now = context.currentTime;
  [0, 0.16].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = index === 0 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.15);
  });
}

export function NotificationBell() {
  const { user } = useUser();
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

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
        if (cancelled) return;
        if (previousUnread !== null && response.unread > previousUnread && audioRef.current) {
          playTone(audioRef.current);
        }
        previousUnread = response.unread;
        setUnread(response.unread);
        updateFavicon(response.unread);
        showTitle(response.unread);
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
    const unlockAudio = () => {
      if (!audioRef.current) {
        const Audio =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Audio) audioRef.current = new Audio();
      }
      void audioRef.current?.resume();
    };

    void load();
    window.addEventListener("jey:notifications-read", onRead);
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      cancelled = true;
      clearTimer();
      stopBlink();
      document.title = baseTitle;
      updateFavicon(0);
      window.removeEventListener("jey:notifications-read", onRead);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
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
