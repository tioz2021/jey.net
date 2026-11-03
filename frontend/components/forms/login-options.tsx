"use client";

import { useSearchParams } from "next/navigation";

import { GoogleSignIn } from "@/components/google-sign-in";
import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";

import styles from "./login-options.module.css";

const ERROR_KEYS: Record<string, TranslationKey> = {
  unavailable: "auth.googleErrorUnavailable",
  cancelled: "auth.googleErrorCancelled",
  state: "auth.googleErrorState",
  code: "auth.googleErrorCode",
  token: "auth.googleErrorToken",
  claims: "auth.googleErrorClaims",
  linked: "auth.googleErrorLinked",
};

export function LoginOptions() {
  const params = useSearchParams();
  const { t } = useI18n();
  const error = params.get("google");

  return (
    <div className={styles.wrapper}>
      {error ? (
        <p className={styles.error} role="alert">
          {ERROR_KEYS[error] ? t(ERROR_KEYS[error]) : t("auth.googleErrorGeneric")}
        </p>
      ) : null}

      <GoogleSignIn />

      <p className={styles.note}>{t("auth.firstTime")}</p>
    </div>
  );
}
