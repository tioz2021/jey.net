"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";

import styles from "./public-footer.module.css";

function noteFor(pathname: string): TranslationKey | null {
  if (pathname.startsWith("/u/") || pathname.startsWith("/cart/")) {
    return "footer.profileNote";
  }

  if (pathname === "/") {
    return "footer.landingNote";
  }

  return null;
}

/** One full-width footer block: what this page is plus the legal links. */
export function PublicFooter() {
  const pathname = usePathname();
  const { t } = useI18n();
  const note = noteFor(pathname);

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.about}>
          <p className={styles.brand}>{t("app.name")}</p>
          {note ? <p className={styles.note}>{t(note)}</p> : null}
        </div>

        <nav aria-label="Документы" className={styles.links}>
          <Link href="/privacy">{t("footer.privacy")}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">{t("footer.terms")}</Link>
        </nav>
      </div>
    </footer>
  );
}
