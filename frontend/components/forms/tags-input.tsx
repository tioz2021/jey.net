"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";

import { Badge, Button, Input } from "@/components/ui";

import styles from "./tags-input.module.css";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

export function TagsInput({
  tags,
  onChange,
  error,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  error?: string;
}) {
  const [value, setValue] = useState("");

  function commit() {
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      setValue("");
      return;
    }

    const next = [...tags];
    for (const part of parts) {
      const duplicate = next.some(
        (tag) => tag.toLowerCase() === part.toLowerCase(),
      );
      if (!duplicate && next.length < MAX_TAGS) {
        next.push(part.slice(0, MAX_TAG_LENGTH));
      }
    }

    onChange(next);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Backspace" && value === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className={styles.field}>
      <Input
        label="Теги"
        hint="Enter или запятая добавляет тег, Backspace убирает последний"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        error={error}
        disabled={tags.length >= MAX_TAGS}
      />

      {tags.length > 0 ? (
        <ul className={styles.chips}>
          {tags.map((tag) => (
            <li key={tag} className={styles.chip}>
              <Badge>{tag}</Badge>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Убрать тег ${tag}`}
                onClick={() => onChange(tags.filter((item) => item !== tag))}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
