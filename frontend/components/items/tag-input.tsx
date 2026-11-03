"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import { Badge, Button, Input } from "@/components/ui";
import { api } from "@/lib/api";

import { useI18n } from "@/lib/locale-context";

import styles from "./tag-input.module.css";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const MAX_SUGGESTIONS = 6;

/**
 * Tag field with autocomplete over the person's existing tags.
 *
 * Enter adds the typed tag (or the highlighted suggestion), arrows move
 * through suggestions, Escape hides them. New tags are created by the server
 * when the record is saved.
 */
export function TagInput({
  tags,
  onChange,
  error,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    let cancelled = false;

    api.tags
      .list()
      .then((response) => {
        if (!cancelled) {
          setKnownTags(response.tags.map((tag) => tag.name));
        }
      })
      .catch(() => {
        // Autocomplete is optional; typing a tag still works.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) {
      return [];
    }

    return knownTags
      .filter((tag) => tag.toLowerCase().includes(needle))
      .filter((tag) => !tags.some((picked) => picked.toLowerCase() === tag.toLowerCase()))
      .slice(0, MAX_SUGGESTIONS);
  }, [knownTags, tags, value]);

  function add(raw: string) {
    const parts = raw
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
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Escape") {
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const highlighted = suggestions[activeIndex];
      add(highlighted ?? value);
      return;
    }

    if (event.key === "Backspace" && value === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className={styles.field}>
      <Input
        label="Теги"
        hint={t("form.tagsHint")}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          add(value);
          setActiveIndex(-1);
        }}
        error={error}
        disabled={tags.length >= MAX_TAGS}
        autoComplete="off"
      />

      {suggestions.length > 0 ? (
        <ul className={styles.suggestions} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`${styles.suggestion} ${index === activeIndex ? styles.active : ""}`}
                onMouseDown={(event) => {
                  // Keep the input focused: mousedown would blur it first.
                  event.preventDefault();
                  add(suggestion);
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

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
