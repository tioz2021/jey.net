"use client";

import { useEffect, useRef, useState } from "react";

import { IconBook } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { BookDetailsResponse, BookSearchItem } from "@/lib/types";

import styles from "./movie-search.module.css";

function coverUrl(
  coverId: number | null | undefined,
  externalUrl: string | null | undefined,
  size: "S" | "M" | "L",
) {
  if (externalUrl) {
    return `/api/v1/books/image?url=${encodeURIComponent(externalUrl)}`;
  }
  return coverId
    ? `/api/v1/books/image?size=${size}&cover=${encodeURIComponent(String(coverId))}`
    : null;
}

/** Search Open Library by title, author or ISBN and resolve a full snapshot. */
export function BookSearch({
  onSelect,
  selected,
  selectedAuthors,
  selectedCoverId,
  selectedCoverUrl,
}: {
  onSelect: (book: BookDetailsResponse) => void;
  selected: string | null;
  selectedAuthors?: string;
  selectedCoverId?: number | null;
  selectedCoverUrl?: string | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [previewCover, setPreviewCover] = useState<number | null>(
    selectedCoverId ?? null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    selectedCoverUrl ?? null,
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      api.books
        .search(q)
        .then((response) => {
          if (!cancelled) {
            setResults(response.results.slice(0, 8));
            setActive(-1);
            setOpen(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setError(t("bookSearch.error"));
            setOpen(true);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function choose(item: BookSearchItem) {
    setPending(true);
    setError(null);

    try {
      const response = await api.books.get(item.book_id);
      onSelect(response.book);
      skipSearch.current = true;
      setQuery(response.book.title);
      setPreviewCover(response.book.cover_id);
      setPreviewUrl(response.book.cover_url);
      setResults([]);
      setOpen(false);
    } catch {
      setError(t("bookSearch.loadError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label} htmlFor="book-search">
        {t("bookSearch.label")}
      </label>
      <div className={styles.field}>
        <svg
          aria-hidden="true"
          className={styles.icon}
          fill="none"
          height="15"
          viewBox="0 0 24 24"
          width="15"
        >
          <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
        <input
          autoComplete="off"
          className={styles.input}
          id="book-search"
          placeholder={t("bookSearch.placeholder")}
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length > 0) {
              setOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && active >= 0) {
              event.preventDefault();
              const item = results[active];
              if (item) {
                void choose(item);
              }
            }
          }}
        />
        {loading ? <span className={styles.hint}>{t("bookSearch.searching")}</span> : null}
      </div>

      {selected && !open ? (
        <div className={styles.selectedBox}>
          {previewCover || previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local cover proxy
            <img
              alt=""
              className={styles.selectedPoster}
              src={coverUrl(previewCover, previewUrl, "M") ?? ""}
            />
          ) : (
            <div aria-hidden="true" className={styles.selectedPoster}>
              <IconBook size={22} />
            </div>
          )}
          <div className={styles.selectedInfo}>
            <p className={styles.selectedTitle}>{selected}</p>
            {selectedAuthors ? (
              <p className={styles.selectedMeta}>{selectedAuthors}</p>
            ) : null}
            <p className={styles.hint}>{t("bookSearch.coverHint")}</p>
          </div>
          <button
            className={styles.replace}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            type="button"
          >
            {t("bookSearch.replace")}
          </button>
        </div>
      ) : (
        <p className={styles.hint}>{t("bookSearch.hint")}</p>
      )}

      {open ? (
        <div className={styles.dropdown}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {!error && results.length === 0 && !loading ? (
            <p className={styles.empty}>{t("bookSearch.notFound")}</p>
          ) : null}
          {results.length > 0 ? (
            <ul className={styles.list}>
              {results.map((item, index) => (
                <li key={item.book_id}>
                  <button
                    className={`${styles.result} ${active === index ? styles.resultActive : ""}`}
                    disabled={pending}
                    onClick={() => void choose(item)}
                    onMouseEnter={() => setActive(index)}
                    type="button"
                  >
                    {coverUrl(item.cover_id, item.cover_url, "S") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local cover proxy
                      <img
                        alt=""
                        className={styles.poster}
                        src={coverUrl(item.cover_id, item.cover_url, "S") ?? ""}
                      />
                    ) : (
                      <div aria-hidden="true" className={styles.poster} />
                    )}
                    <span className={styles.info}>
                      <span className={styles.title}>{item.title}</span>
                      <span className={styles.meta}>
                        {[item.authors.slice(0, 2).join(", "), item.year]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.source}>
            {t("bookSearch.source")}{" "}
            <a href="https://openlibrary.org" rel="noreferrer" target="_blank">
              Open Library
            </a>
            {" · "}
            <a href="https://books.google.com" rel="noreferrer" target="_blank">
              Google Books
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
