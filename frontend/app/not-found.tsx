import Link from "next/link";

import { Card } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

import styles from "./not-found.module.css";

export default async function NotFound() {
  const locale = await getServerLocale();
  return (
    <main className={styles.page}>
      <Card title={translate(locale, "notFound.title")}>
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
