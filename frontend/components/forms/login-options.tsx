"use client";

import { useSearchParams } from "next/navigation";

import { GoogleSignIn } from "@/components/google-sign-in";
import { useUser } from "@/lib/user-context";

import styles from "./login-options.module.css";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  unavailable: "Вход через Google пока не настроен.",
  cancelled: "Вход отменён.",
  state: "Сессия входа истекла, попробуйте ещё раз.",
  code: "Google не вернул код входа.",
  token: "Не удалось подтвердить вход у Google.",
  claims: "Google не подтвердил email этого аккаунта.",
  linked: "Этот email уже привязан к другому Google-аккаунту.",
};

export function LoginOptions() {
  const params = useSearchParams();
  const { user } = useUser();
  const error = params.get("google");

  return (
    <div className={styles.wrapper}>
      {error ? (
        <p className={styles.error} role="alert">
          {ERRORS[error] ?? "Не удалось войти через Google."}
        </p>
      ) : null}

      <GoogleSignIn />

      <p className={styles.note}>
        Впервые здесь? Аккаунт создастся автоматически, пароль не нужен.
      </p>

      {user ? null : (
        <details className={styles.password}>
          <summary>Войти по паролю</summary>
          <div className={styles.passwordBody}>
            <LoginForm />
          </div>
        </details>
      )}
    </div>
  );
}
