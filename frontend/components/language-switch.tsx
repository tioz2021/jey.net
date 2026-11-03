"use client";

import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./language-switch.module.css";

const LABELS: Record<Locale, string> = {
  ru: "RU",
  uk: "UA",
  en: "EN",
};

/** Three compact buttons; the choice is a cookie and the profile locale. */
export function LanguageSwitch() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const { user, setUser } = useUser();

  async function choose(next: Locale) {
    if (next === locale) {
      return;
    }

    setLocale(next);

    if (user) {
      try {
        const response = await api.auth.updateMe({ locale: next });
        setUser(response.user);
      } catch {
        // The cookie already switched the interface; the profile can catch up
        // on the next explicit save.
      }
    }

    router.refresh();
  }

  return (
    <div aria-label={t("language.label")} className={styles.group} role="group">
      {SUPPORTED_LOCALES.map((value) => (
        <button
          aria-pressed={value === locale}
          className={`${styles.button} ${value === locale ? styles.active : ""}`}
          key={value}
          onClick={() => choose(value)}
          title={LABELS[value]}
          type="button"
        >
          {LABELS[value]}
        </button>
      ))}
    </div>
  );
}
