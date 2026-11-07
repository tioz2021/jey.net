"use client";

import { useState } from "react";

import { useI18n } from "@/lib/locale-context";

import styles from "./google-sign-in.module.css";

function describeError(cause: unknown): string {
  if (cause instanceof ArrayBuffer) {
    const text = new TextDecoder().decode(cause).trim();
    return text || "Ошибка Tauri";
  }
  if (ArrayBuffer.isView(cause)) {
    const text = new TextDecoder().decode(cause as ArrayBufferView).trim();
    return text || "Ошибка Tauri";
  }
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  try { return JSON.stringify(cause); } catch { return String(cause); }
}

export function GoogleSignIn({ label, next }: { label?: string; next?: string }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: React.MouseEvent<HTMLAnchorElement>) {
    const desktop = (window as unknown as { __TAURI__?: { core?: { invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T> } } }).__TAURI__;
    if (!desktop?.core?.invoke) return;
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await desktop.core.invoke("local_google_sign_in", { input: { server_url: "https://j3ynet.site" } });
      window.sessionStorage.setItem("jey-after-login", next ?? "/items");
      window.location.assign("/");
    } catch (cause) {
      console.error("desktop google sign-in failed", cause);
      setError(describeError(cause));
      setPending(false);
    }
  }

  return (
    <>
    <a className={styles.button} href={`/api/v1/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`} onClick={signIn}>
      <svg aria-hidden="true" height="18" viewBox="0 0 48 48" width="18">
        <path
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          fill="#EA4335"
        />
        <path
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          fill="#4285F4"
        />
        <path
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
          fill="#FBBC05"
        />
        <path
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          fill="#34A853"
        />
      </svg>
      {pending ? "Ожидаем Google…" : (label ?? t("auth.google"))}
    </a>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </>
  );
}
