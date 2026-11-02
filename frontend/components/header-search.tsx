"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./header-search.module.css";

/** A compact magnifier button that expands into the search field. */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <button
        aria-label="Поиск по записям"
        className={styles.button}
        onClick={() => setOpen(true)}
        title="Поиск"
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
          <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    <form
      action="/items"
      className={styles.form}
      method="get"
      onSubmit={() => setOpen(false)}
      role="search"
    >
      <svg aria-hidden="true" className={styles.icon} fill="none" height="14" viewBox="0 0 24 24" width="14">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
        <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        aria-label="Поиск по записям"
        className={styles.input}
        name="q"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Поиск"
        ref={inputRef}
        type="search"
      />
    </form>
  );
}
