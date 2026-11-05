"use client";

import { useEffect, useState } from "react";

import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";

import styles from "./push-settings.module.css";

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

export function PushSettings() {
  const { t } = useI18n();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      navigator.serviceWorker.ready,
      api.push.key(),
    ])
      .then(async ([registration, result]) => {
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setSupported(true);
          setPublicKey(result.key);
          setSubscription(existing);
        }
      })
      .catch(() => !cancelled && setSupported(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey || !supported) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(t("settings.pushDenied"));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const next = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationKey(publicKey),
      });
      const json = next.toJSON();
      await api.push.subscribe({
        endpoint: json.endpoint,
        keys: json.keys,
      });
      setSubscription(next);
    } catch {
      setError(t("settings.pushError"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api.push.unsubscribe(endpoint);
      setSubscription(null);
    } catch {
      setError(t("settings.pushError"));
    } finally {
      setBusy(false);
    }
  }

  if (supported === false || !publicKey) return null;

  return (
    <Card title={t("settings.pushTitle")}>
      <p className={styles.hint}>{t("settings.pushHint")}</p>
      <div className={styles.row}>
        <span className={styles.status}>
          {subscription ? t("settings.pushOn") : t("settings.pushOff")}
        </span>
        <Button
          loading={busy}
          onClick={() => void (subscription ? disable() : enable())}
          size="sm"
          variant={subscription ? "secondary" : "primary"}
        >
          {subscription ? t("settings.pushDisable") : t("settings.pushEnable")}
        </Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}
