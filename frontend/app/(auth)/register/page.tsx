import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { GoogleSignIn } from "@/components/google-sign-in";
import { RedirectIfAuthenticated } from "@/components/redirect-if-authenticated";
import { Card } from "@/components/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Регистрация — jey.net",
};

export default function RegisterPage() {
  return (
    <div className={styles.wrapper}>
      <Card title="Регистрация">
        <Suspense fallback={null}>
          <RedirectIfAuthenticated />
        </Suspense>
        <p className={styles.footer}>
          Отдельная регистрация больше не нужна: войдите через Google, и аккаунт
          создастся сам. Ник вы выберете на следующем шаге.
        </p>
        <div style={{ marginTop: "var(--space-4)" }}>
          <GoogleSignIn label="Продолжить с Google" />
        </div>
      </Card>
      <p className={styles.footer}>
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>

      <p className={styles.footer}>
        <Link href="/privacy">Политика конфиденциальности</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms">Условия использования</Link>
      </p>
    </div>
  );
}
