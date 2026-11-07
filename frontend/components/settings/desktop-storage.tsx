"use client";

import { useEffect, useState } from "react";

import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toasts";

import styles from "./desktop-storage.module.css";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function tauri(): Invoke | null {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return api?.core?.invoke ?? null;
}

export function DesktopStorage() {
  const invoke = tauri();
  const { notify, notifyError } = useToast();
  const [path, setPath] = useState<string | null>(null);
  const [restart, setRestart] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invoke) return;
    invoke<{ data_dir: string }>("local_storage_info").then((info) => setPath(info.data_dir)).catch(() => {});
  }, [invoke]);

  if (!invoke) return null;

  async function choose() {
    const api = invoke;
    if (!api) return;
    setBusy(true);
    try {
      const result = await api<{ data_dir?: string; restart?: boolean; cancelled?: boolean }>("local_choose_data_dir");
      if (result.cancelled) return;
      if (result.data_dir) setPath(result.data_dir);
      if (result.restart) {
        setRestart(true);
        notify({ tone: "success", title: "Папка выбрана", text: "Данные скопированы. Перезапустите приложение.", requestId: null });
      }
    } catch (cause) {
      notifyError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Локальные данные">
      <div className={styles.body}>
        <p className={styles.hint}>База, обложки и настройки хранятся в этой папке.</p>
        <code className={styles.path}>{path ?? "…"}</code>
        <Button loading={busy} onClick={() => void choose()} size="sm" variant="secondary">Выбрать папку</Button>
        {restart ? <p className={styles.warn}>Перезапустите jey.net, чтобы открыть данные из новой папки.</p> : null}
      </div>
    </Card>
  );
}
