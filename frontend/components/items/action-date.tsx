"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Item, MovieDetails } from "@/lib/types";

import styles from "./action-date.module.css";

/** Date of the real-world action plus the film rewatch shortcut. */
export function ActionDate({ item }: { item: Item }) {
  const router = useRouter();
  const { t } = useI18n();
  const [date, setDate] = useState(
    item.details?.last_action_at?.slice(0, 10) ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item.details) return null;

  async function save(next: Partial<MovieDetails>) {
    setBusy(true);
    setError(null);
    try {
      const details: MovieDetails = { ...item.details!, ...next };
      await api.items.update(item.id, { details });
      router.refresh();
    } catch {
      setError(t("actionDate.error"));
    } finally {
      setBusy(false);
    }
  }

  const label =
    item.kind === "movie"
      ? t("actionDate.movie")
      : item.kind === "tv" || item.kind === "anime"
        ? t("actionDate.watch")
        : item.kind === "book"
          ? t("actionDate.book")
          : t("actionDate.game");

  return (
    <Card title={t("actionDate.title")}>
      <div className={styles.form}>
        <Input
          label={label}
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
        <Button
          disabled={busy}
          onClick={() =>
            void save({
              last_action_at: date ? `${date}T00:00:00.000Z` : null,
            })
          }
          size="sm"
          variant="secondary"
        >
          {busy ? t("progress.saving") : t("actionDate.save")}
        </Button>
        {item.kind === "movie" ? (
          <Button
            disabled={busy}
            onClick={() => {
              const now = new Date().toISOString();
              setDate(now.slice(0, 10));
              void save({
                last_action_at: now,
                rewatch_count: (item.details?.rewatch_count ?? 0) + 1,
              });
            }}
            size="sm"
          >
            {t("actionDate.rewatched")}
          </Button>
        ) : null}
      </div>
      {item.details.rewatch_count ? (
        <p className={styles.muted}>
          {t("card.rewatched", { count: item.details.rewatch_count })}
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}
