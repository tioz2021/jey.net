"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { MovieDetailsResponse, MovieSearchItem } from "@/lib/types";

import styles from "./movie-search.module.css";

/**
 * Search-as-you-type for films. The browser never sees the TMDB key: our API
 * proxies the request. Picking a film loads its details and hands them to the
 * form.
 */
export function MovieSearch({
  onSelect,
  selected,
  media = "movie",
}: {
  onSelect: (movie: MovieDetailsResponse) => void;
  selected: string | null;
  media?: "movie" | "tv";
}) {
  const { t } = useI18n();
  const search = media === "tv" ? api.tv.search : api.movies.search;
  const get = media === "tv" ? api.tv.get : api.movies.get;
  const inputId = media === "tv" ? "tv-search" : "movie-search";
  const copy =
    media === "tv"
      ? {
          label: "tvSearch.label" as const,
          placeholder: "tvSearch.placeholder" as const,
          hint: "tvSearch.hint" as const,
          error: "tvSearch.error" as const,
          loadError: "tvSearch.loadError" as const,
          notFound: "tvSearch.notFound" as const,
          selected: "tvSearch.selected" as const,
        }
      : {
          label: "movieSearch.label" as const,
          placeholder: "movieSearch.placeholder" as const,
          hint: "movieSearch.hint" as const,
          error: "movieSearch.error" as const,
          loadError: "movieSearch.loadError" as const,
          notFound: "movieSearch.notFound" as const,
          selected: "movieSearch.selected" as const,
        };
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Choosing a film fills the input with its title; that must not trigger a
  // fresh search and reopen the dropdown.
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
      search(q)
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
            setError(t(copy.error));
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
  }, [query, t, search, copy.error]);

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

  async function choose(item: MovieSearchItem) {
    setPending(true);
    setError(null);

    try {
      const response = await get(item.tmdb_id);
      onSelect(response.movie);
      skipSearch.current = true;
      setQuery(response.movie.title);
      setPosterPath(response.movie.poster_path);
      setResults([]);
      setOpen(false);
    } catch {
      setError(t(copy.loadError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label} htmlFor={inputId}>
        {t(copy.label)}
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
          id={inputId}
          placeholder={t(copy.placeholder)}
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
        {loading ? (
          <span className={styles.hint}>{t("movieSearch.searching")}</span>
        ) : null}
      </div>

      {selected && !open ? (
        <div className={styles.selectedBox}>
          {posterPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxied TMDB poster
            <img
              alt=""
              className={styles.selectedPoster}
              src={`/api/v1/movies/image?size=w92&path=${encodeURIComponent(posterPath)}`}
            />
          ) : null}
          <div>
            <p className={styles.selected}>
              {t(copy.selected, { title: selected })}
            </p>
            <p className={styles.hint}>{t("movieSearch.posterHint")}</p>
          </div>
        </div>
      ) : (
        <p className={styles.hint}>{t(copy.hint)}</p>
      )}

      {open ? (
        <div className={styles.dropdown}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {!error && results.length === 0 && !loading ? (
            <p className={styles.empty}>{t(copy.notFound)}</p>
          ) : null}
          {results.length > 0 ? (
            <ul className={styles.list}>
              {results.map((item, index) => (
                <li key={item.tmdb_id}>
                  <button
                    className={`${styles.result} ${index === active ? styles.resultActive : ""}`}
                    disabled={pending}
                    onClick={() => choose(item)}
                    onMouseEnter={() => setActive(index)}
                    type="button"
                  >
                    {item.poster_path ? (
                      // eslint-disable-next-line @next/next/no-img-element -- TMDB thumbnail
                      <img
                        alt=""
                        className={styles.poster}
                        loading="lazy"
                        src={`/api/v1/movies/image?size=w92&path=${encodeURIComponent(item.poster_path)}`}
                      />
                    ) : (
                      <span className={styles.poster} aria-hidden="true" />
                    )}
                    <span className={styles.info}>
                      <span className={styles.title}>{item.title}</span>
                      <span className={styles.meta}>
                        {item.year ?? "—"}
                        {item.original_title !== item.title
                          ? ` · ${item.original_title}`
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.source}>
            {t("movieSearch.credits")}{" "}
            <a href="https://www.themoviedb.org" rel="noreferrer" target="_blank">
              TMDB
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
