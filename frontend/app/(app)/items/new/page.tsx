import type { Metadata } from "next";
import Link from "next/link";

import { ItemForm } from "@/components/forms/item-form";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Новая запись — jey",
};

export default function NewItemPage() {
  return (
    <main>
      <p className={styles.back}>
        <Link href="/items">← К записям</Link>
      </p>
      <h1 className={styles.title}>Новая запись</h1>
      <ItemForm />
    </main>
  );
}
