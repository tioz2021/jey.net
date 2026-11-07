"use client";

import { AppLink } from "@/lib/navigation";

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
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname.replace(/^\/spa/, "");
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
          <AppLink href="/privacy">{t("footer.privacy")}</AppLink>
          <span aria-hidden="true">·</span>
          <AppLink href="/terms">{t("footer.terms")}</AppLink>
        </nav>
      </div>
    </footer>
  );
}
