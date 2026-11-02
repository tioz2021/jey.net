import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/components/forms/login-form";
import { RedirectIfAuthenticated } from "@/components/redirect-if-authenticated";
import { Card } from "@/components/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Вход — jey.net",
};

export default function LoginPage() {
  return (
    <div className={styles.wrapper}>
      <Card title="Вход">
        {/* useSearchParams needs a Suspense boundary during prerendering. */}
        <Suspense fallback={null}>
          <RedirectIfAuthenticated />
          <LoginForm />
        </Suspense>
      </Card>
      <p className={styles.footer}>
        Нет аккаунта? <Link href="/register">Зарегистрироваться</Link>
      </p>

      <p className={styles.footer}>
        <Link href="/privacy">Политика конфиденциальности</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms">Условия использования</Link>
      </p>
    </div>
  );
}
