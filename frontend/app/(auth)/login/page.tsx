import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/components/forms/login-form";
import { Card } from "@/components/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Вход — jey",
};

export default function LoginPage() {
  return (
    <div className={styles.wrapper}>
      <Link className={styles.brand} href="/">
        jey
      </Link>
      <Card title="Вход">
        {/* useSearchParams needs a Suspense boundary during prerendering. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </Card>
      <p className={styles.footer}>
        Нет аккаунта? <Link href="/register">Зарегистрироваться</Link>
      </p>
    </div>
  );
}
