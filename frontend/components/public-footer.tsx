"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./public-footer.module.css";

function noteFor(pathname: string): string | null {
  if (pathname.startsWith("/u/")) {
    return "Завершённые записи с оценками и заметками автора. Черновики и планы скрыты.";
  }

  if (pathname === "/") {
    return "Личный портал для фильмов, книг и картинок — без рекламы и алгоритмов.";
  }

  return null;
}

/** One full-width footer block: what this page is plus the legal links. */
export function PublicFooter() {
  const pathname = usePathname();
  const note = noteFor(pathname);

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.about}>
          <p className={styles.brand}>jey.net</p>
          {note ? <p className={styles.note}>{note}</p> : null}
        </div>

        <nav aria-label="Документы" className={styles.links}>
          <Link href="/privacy">Политика конфиденциальности</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">Условия использования</Link>
        </nav>
      </div>
    </footer>
  );
}
