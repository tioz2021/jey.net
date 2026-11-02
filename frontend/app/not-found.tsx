import Link from "next/link";

import { Card } from "@/components/ui";

import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <Card title="Страница не найдена">
        <p className={styles.text}>
          Возможно, запись удалена, принадлежит другому аккаунту — или такой
          страницы никогда не было.
        </p>
        <p className={styles.text}>
          <Link href="/items">← К записям</Link>
        </p>
      </Card>
    </main>
  );
}
