"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@/components/ui";

import { useI18n } from "@/lib/locale-context";

import { useItemsQuery } from "./query-context";
import styles from "./search-box.module.css";

const DEBOUNCE_MS = 300;

export function SearchBox({ className }: { className?: string }) {
  const { t } = useI18n();
  const { params, update } = useItemsQuery();
  const urlQuery = params.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL is the source of truth: "сбросить фильтры" and the back button
  // must update the field too. Trailing spaces typed by the person are kept.
  useEffect(() => {
    setValue((current) => (current.trim() === urlQuery ? current : urlQuery));
  }, [urlQuery]);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  function apply(next: string) {
    const trimmed = next.trim();

    update((params) => {
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
    });
  }

  function handleChange(next: string) {
    setValue(next);

    if (timer.current) {
      clearTimeout(timer.current);
    }

    // One request per pause, not per keystroke.
    timer.current = setTimeout(() => apply(next), DEBOUNCE_MS);
  }

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
    }

    setValue("");
    apply("");
  }

  return (
    <div className={`${styles.wrapper} ${className ?? ""}`}>
      <div className={styles.field}>
        <Input
          label={t("search.fieldLabel")}
          type="search"
          placeholder={t("search.fieldPlaceholder")}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
        />
      </div>

      {value ? (
        <Button variant="ghost" size="sm" onClick={clear}>
          {t("search.clear")}
        </Button>
      ) : null}
    </div>
  );
}
