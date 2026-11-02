"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@/components/ui";

import styles from "./search-box.module.css";

const DEBOUNCE_MS = 300;

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

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
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = next.trim();

    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }

    const query = params.toString();
    router.replace(query ? `/items?${query}` : "/items", { scroll: false });
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
    <div className={styles.wrapper}>
      <div className={styles.field}>
        <Input
          label="Поиск"
          type="search"
          placeholder="Название, автор или заметка"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
        />
      </div>

      {value ? (
        <Button variant="ghost" size="sm" onClick={clear}>
          Очистить
        </Button>
      ) : null}
    </div>
  );
}
