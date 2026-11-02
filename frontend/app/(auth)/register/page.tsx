import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/forms/register-form";
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
        <RegisterForm />
      </Card>
      <p className={styles.footer}>
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>
    </div>
  );
}
