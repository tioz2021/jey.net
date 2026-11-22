"use client";

import { useEffect, useState } from "react";

import { Button, Card } from "@/components/ui";
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
  const [measuring, setMeasuring] = useState(false);
  const [fps, setFps] = useState<number | null>(null);

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

  function measureFps() {
    setFps(null);
    setMeasuring(true);
    let frames = 0;
    const started = performance.now();
    const tick = (now: number) => {
      frames += 1;
      if (now - started < 2500) {
        requestAnimationFrame(tick);
        return;
      }
      setFps((frames * 1000) / (now - started));
      setMeasuring(false);
    };
    requestAnimationFrame(tick);
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
        <Button loading={measuring} onClick={measureFps} size="sm" variant="secondary">
          {t("settings.gpuMeasure")}
        </Button>
        {fps !== null ? (
          <p className={styles.hint}>{t("settings.gpuFps", { fps: fps.toFixed(1) })}</p>
        ) : null}
        {restart ? <p className={styles.warn}>{t("settings.gpuRestart")}</p> : null}
      </div>
    </Card>
  );
}
