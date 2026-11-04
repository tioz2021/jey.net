"use client";

import { useEffect, useRef, useState } from "react";

import { IconGame } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { GameSearchItem, MovieDetails } from "@/lib/types";

import styles from "./movie-search.module.css";

function cover(url: string | null | undefined) {
  return url ? `/api/v1/games/image?url=${encodeURIComponent(url)}` : null;
}

export function GameSearch({
  onSelect,
  selected,
  selectedPlatforms,
  selectedCoverUrl,
}: {
  onSelect: (game: MovieDetails, igdbId: number) => void;
  selected: string | null;
  selectedPlatforms?: string;
  selectedCoverUrl?: string | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [preview, setPreview] = useState<string | null>(selectedCoverUrl ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
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
      api.games
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
            setError(t("gameSearch.error"));
            setOpen(true);
          }
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, t]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function choose(item: GameSearchItem) {
    setPending(true);
    setError(null);
    try {
      const response = await api.games.get(item.igdb_id);
      onSelect(response.game, item.igdb_id);
      skip.current = true;
      setQuery(response.game.original_title);
      setPreview(item.cover_url);
      setResults([]);
      setOpen(false);
    } catch {
      setError(t("gameSearch.loadError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label} htmlFor="game-search">
        {t("gameSearch.label")}
      </label>
      <div className={styles.field}>
        <svg aria-hidden="true" className={styles.icon} fill="none" height="15" viewBox="0 0 24 24" width="15">
          <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
        <input
          autoComplete="off"
          className={styles.input}
          id="game-search"
          placeholder={t("gameSearch.placeholder")}
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && active >= 0) {
              event.preventDefault();
              const item = results[active];
              if (item) void choose(item);
            }
          }}
        />
        {loading ? <span className={styles.hint}>{t("gameSearch.searching")}</span> : null}
      </div>

      {selected && !open ? (
        <div className={styles.selectedBox}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local cover proxy
            <img alt="" className={styles.selectedPoster} src={cover(preview) ?? ""} />
          ) : (
            <div aria-hidden="true" className={styles.selectedPoster}>
              <IconGame size={22} />
            </div>
          )}
          <div className={styles.selectedInfo}>
            <p className={styles.selectedTitle}>{selected}</p>
            {selectedPlatforms ? <p className={styles.selectedMeta}>{selectedPlatforms}</p> : null}
            <p className={styles.hint}>{t("gameSearch.coverHint")}</p>
          </div>
          <button className={styles.replace} onClick={() => { setQuery(""); inputRef.current?.focus(); }} type="button">
            {t("gameSearch.replace")}
          </button>
        </div>
      ) : (
        <p className={styles.hint}>{t("gameSearch.hint")}</p>
      )}

      {open ? (
        <div className={styles.dropdown}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {!error && results.length === 0 && !loading ? <p className={styles.empty}>{t("gameSearch.notFound")}</p> : null}
          {results.length > 0 ? (
            <ul className={styles.list}>
              {results.map((item, index) => (
                <li key={item.igdb_id}>
                  <button
                    className={`${styles.result} ${active === index ? styles.resultActive : ""}`}
                    disabled={pending}
                    onClick={() => void choose(item)}
                    onMouseEnter={() => setActive(index)}
                    type="button"
                  >
                    {cover(item.cover_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local cover proxy
                      <img alt="" className={styles.poster} src={cover(item.cover_url) ?? ""} />
                    ) : (
                      <div aria-hidden="true" className={styles.poster} />
                    )}
                    <span className={styles.info}>
                      <span className={styles.title}>{item.title}</span>
                      <span className={styles.meta}>
                        {[item.year, item.platforms.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.source}>
            {t("gameSearch.source")}{" "}
            <a href="https://www.igdb.com" rel="noreferrer" target="_blank">IGDB</a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
