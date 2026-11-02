import type { Metadata } from "next";
import Link from "next/link";

import { ItemForm } from "@/components/forms/item-form";
import { Card, PageHeader } from "@/components/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Новая запись — jey.net",
};

export default function NewItemPage() {
  return (
    <main>
      <p className={styles.back}>
        <Link href="/items">← К записям</Link>
      </p>
      <PageHeader title="Новая запись" />
      <Card>
        <ItemForm />
      </Card>
    </main>
  );
}
