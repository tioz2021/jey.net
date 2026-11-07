"use client";

import { useSearchParams } from "next/navigation";

import { GoogleSignIn } from "@/components/google-sign-in";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";
import { useState } from "react";

import styles from "./login-options.module.css";

const ERROR_KEYS: Record<string, TranslationKey> = {
  unavailable: "auth.googleErrorUnavailable",
  cancelled: "auth.googleErrorCancelled",
  state: "auth.googleErrorState",
  code: "auth.googleErrorCode",
  token: "auth.googleErrorToken",
  claims: "auth.googleErrorClaims",
  linked: "auth.googleErrorLinked",
  registration_closed: "auth.googleErrorRegistrationClosed",
};

export function LoginOptions({ next }: { next?: string }) {
  const params = useSearchParams();
  const { t } = useI18n();
  const error = params.get("google");
  const [starting, setStarting] = useState(false);

  async function startLocalLibrary() {
    const api = (window as unknown as { __TAURI__?: { core?: { invoke?: <T>(command: string) => Promise<T> } } }).__TAURI__;
    if (!api?.core?.invoke) return;
    setStarting(true);
    try {
      await api.core.invoke("local_bootstrap_access");
      window.sessionStorage.setItem("jey-after-login", "/items");
      window.location.assign("/");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {error ? (
        <p className={styles.error} role="alert">
          {ERROR_KEYS[error] ? t(ERROR_KEYS[error]) : t("auth.googleErrorGeneric")}
        </p>
      ) : null}

      <GoogleSignIn next={next} />

      {(window as unknown as { __TAURI__?: unknown }).__TAURI__ ? (
        <Button loading={starting} onClick={() => void startLocalLibrary()} size="sm" variant="secondary">
          Открыть локальную библиотеку
        </Button>
      ) : null}

      <p className={styles.note}>{t("auth.firstTime")}</p>
    </div>
  );
}
