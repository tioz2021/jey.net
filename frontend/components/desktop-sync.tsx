"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./desktop-sync.module.css";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function tauri(): Invoke | null {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return api?.core?.invoke ?? null;
}

type Report = { pushed: number; pulled: number; conflicts: number; media: number; last_seq: number };

export function DesktopSync() {
  const invoke = useRef<Invoke | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "syncing" | "error">("idle");
  const [label, setLabel] = useState("Синхронизировать");
  const [detail, setDetail] = useState("");
  const busy = useRef(false);

  const run = useCallback(async (showResult: boolean) => {
    if (!invoke.current || busy.current) return;
    busy.current = true;
    setState("syncing");
    setLabel("Синхронизация…");
    try {
      const access = await invoke.current<{ has_access: boolean }>("local_access_status");
      if (!access.has_access) {
        setState("idle");
        setLabel("Синхронизировать");
        return;
      }
      const report = await invoke.current<Report>("local_sync");
      setState("idle");
      setLabel("Синхронизировать");
      setDetail(`Отправлено ${report.pushed}, получено ${report.pulled}, обложек ${report.media}`);
      if (showResult) {
        window.dispatchEvent(new CustomEvent("jey:toast", { detail: `Синхронизировано: ${report.pushed} → ${report.pulled}` }));
      }
      window.dispatchEvent(new Event("jey:sync-complete"));
    } catch (cause) {
      setState("error");
      setLabel("Повторить синхронизацию");
      setDetail(String(cause));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    invoke.current = tauri();
    if (!invoke.current) return;
    setReady(true);
    void run(false);
    const timer = window.setInterval(() => void run(false), 5 * 60 * 1000);
    const online = () => void run(false);
    const changed = () => {
      window.setTimeout(() => void run(false), 1200);
    };
    window.addEventListener("online", online);
    window.addEventListener("jey:sync-needed", changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("jey:sync-needed", changed);
    };
  }, [run]);

  if (!ready) return null;

  return (
    <button
      aria-label={label}
      className={`${styles.button} ${state === "error" ? styles.error : ""}`}
      disabled={state === "syncing"}
      onClick={() => void run(true)}
      title={detail || label}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
        <path d="M20 11a8 8 0 0 0-14.9-3M4 5v5h5M4 13a8 8 0 0 0 14.9 3M20 19v-5h-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
      <span className={styles.dot} />
    </button>
  );
}
