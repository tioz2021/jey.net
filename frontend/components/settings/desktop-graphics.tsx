"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { useToast } from "@/components/toasts";
import { useI18n } from "@/lib/locale-context";

import styles from "./desktop-storage.module.css";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function tauri(): Invoke | null {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return api?.core?.invoke ?? null;
}

export function DesktopGraphics() {
  const invoke = tauri();
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [restart, setRestart] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invoke) return;
    invoke<{ enabled: boolean }>("local_gpu_info")
      .then((info) => setEnabled(info.enabled))
      .catch(() => {});
  }, [invoke]);

  if (!invoke) return null;

  async function change(next: boolean) {
    const api = invoke;
    if (!api) return;
    setBusy(true);
    try {
      const result = await api<{ enabled: boolean; restart_required: boolean }>(
        "local_set_gpu_acceleration",
        { enabled: next },
      );
      setEnabled(result.enabled);
      setRestart(result.restart_required);
      notify({
        tone: "success",
        title: t("settings.gpuSaved"),
        text: t("settings.gpuRestart"),
        requestId: null,
      });
    } catch (cause) {
      notifyError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("settings.gpuTitle")}>
      <div className={styles.body}>
        <label className={styles.switchRow}>
          <input
            checked={enabled}
            disabled={busy}
            onChange={(event) => void change(event.target.checked)}
            type="checkbox"
          />
          <span>{t("settings.gpuEnabled")}</span>
        </label>
        <p className={styles.hint}>{t("settings.gpuHint")}</p>
        {restart ? <p className={styles.warn}>{t("settings.gpuRestart")}</p> : null}
      </div>
    </Card>
  );
}
