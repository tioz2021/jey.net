import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { RegisterForm } from "@/components/forms/register-form";
import { RedirectIfAuthenticated } from "@/components/redirect-if-authenticated";
import { Card } from "@/components/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Регистрация — jey",
};

export default function RegisterPage() {
  return (
    <div className={styles.wrapper}>
      <Link className={styles.brand} href="/">
        jey
      </Link>
      <Card title="Регистрация">
        <Suspense fallback={null}>
          <RedirectIfAuthenticated />
          <RegisterForm />
        </Suspense>
      </Card>
      <p className={styles.footer}>
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>
    </div>
  );
}
