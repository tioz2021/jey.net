import { useI18n } from "@/lib/locale-context";

import styles from "./header-search.module.css";

/** Classic header search: a text field with a submit button next to it. */
export function HeaderSearch() {
  const { t } = useI18n();

  return (
    <form action="/items" className={styles.form} method="get" role="search">
      <label className="visually-hidden" htmlFor="global-search">
        {t("search.label")}
      </label>
      <input
        autoComplete="off"
        className={styles.input}
        id="global-search"
        name="q"
        placeholder={t("search.placeholder")}
        type="search"
      />
      <button
        aria-label={t("search.submit")}
        className={styles.submit}
        title={t("search.submit")}
        type="submit"
      >
        <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
          <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
