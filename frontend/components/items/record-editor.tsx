"use client";

import { useAppRouter } from "@/lib/navigation";
import { useState } from "react";

import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Item, MovieDetails } from "@/lib/types";

import styles from "./record-editor.module.css";

/** One compact form for the action date, progress and film rewatches. */
export function RecordEditor({ item }: { item: Item }) {
  const router = useAppRouter();
  const { t } = useI18n();
  const unit = item.kind === "book" ? "page" : "hour";
  const hasProgress = ["book", "game"].includes(item.kind);
  const fallbackTotal =
    item.kind === "anime"
      ? item.details?.number_of_episodes
      : item.kind === "book"
        ? item.details?.page_count
        : null;
  const [date, setDate] = useState(
    item.details?.last_action_at?.slice(0, 10) ?? "",
  );
  const [current, setCurrent] = useState(
    String(item.details?.progress?.current ?? 0),
  );
  const [rewatches, setRewatches] = useState(
    String(item.details?.rewatch_count ?? 0),
  );
  const [total, setTotal] = useState(
    String(item.details?.progress?.total ?? fallbackTotal ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item.details) return null;

  const actionLabel =
    item.kind === "movie"
      ? t("actionDate.movie")
      : item.kind === "tv" || item.kind === "anime"
        ? t("actionDate.watch")
        : item.kind === "book"
          ? t("actionDate.book")
          : t("actionDate.game");

  async function save(rewatch = false) {
    const currentValue = Number(current);
    const totalValue = total.trim() === "" ? null : Number(total);
    const rewatchValue = rewatch
      ? (item.details?.rewatch_count ?? 0) + 1
      : Number(rewatches);
    if (
      hasProgress &&
      (!Number.isInteger(currentValue) ||
        currentValue < 0 ||
        (totalValue !== null &&
          (!Number.isInteger(totalValue) || totalValue <= 0 || currentValue > totalValue)))
    ) {
      setError(t("progress.invalid"));
      return;
    }
    if (
      item.kind === "movie" &&
      (!Number.isInteger(rewatchValue) || rewatchValue < 0)
    ) {
      setError(t("actionDate.invalidRewatches"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const details: MovieDetails = {
        ...item.details!,
        last_action_at: rewatch
          ? new Date().toISOString()
          : date
            ? `${date}T00:00:00.000Z`
            : new Date().toISOString(),
        ...(item.kind === "movie" ? { rewatch_count: rewatchValue } : {}),
        ...(hasProgress
          ? {
              progress: {
                current: currentValue,
                total: totalValue,
                unit,
              },
            }
          : {}),
      };
      await api.items.update(item.id, { details });
      if (rewatch) {
        setDate(new Date().toISOString().slice(0, 10));
        setRewatches(String(rewatchValue));
      }
      router.refresh();
    } catch {
      setError(t("progress.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("recordEditor.title")}>
      <div className={styles.grid}>
        <Input
          label={actionLabel}
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
        {item.kind === "movie" ? (
          <Input
            inputMode="numeric"
            label={t("actionDate.rewatches")}
            min={0}
            onChange={(event) => setRewatches(event.target.value)}
            type="number"
            value={rewatches}
          />
        ) : null}
        {hasProgress ? (
          <>
            <Input
              inputMode="numeric"
              label={unit === "page" ? t("progress.pages") : t("progress.hours")}
              min={0}
              onChange={(event) => setCurrent(event.target.value)}
              type="number"
              value={current}
            />
            {unit !== "hour" ? (
              <Input
                inputMode="numeric"
                label={t("progress.total")}
                min={1}
                onChange={(event) => setTotal(event.target.value)}
                type="number"
                value={total}
              />
            ) : null}
          </>
        ) : null}
      </div>
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void save()} size="sm">
          {busy ? t("progress.saving") : t("recordEditor.save")}
        </Button>
        {item.kind === "movie" ? (
          <Button
            disabled={busy}
            onClick={() => void save(true)}
            size="sm"
            variant="secondary"
          >
            {t("actionDate.rewatched")}
          </Button>
        ) : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}
