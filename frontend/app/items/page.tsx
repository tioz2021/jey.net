import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Каталог — jey",
};

// Placeholder: the real catalogue arrives with the list page task.
export default function ItemsPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <Card title="Каталог">
          <p className={styles.text}>
            Здесь будет список записей с фильтрами и поиском. Аккаунт создан —
            страница каталога появится в ближайших задачах.
          </p>
          <p className={styles.text}>
            <Link href="/">На главную</Link>
          </p>
        </Card>
      </main>
    </>
  );
}
