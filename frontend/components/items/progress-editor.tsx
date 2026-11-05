"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Item, MovieDetails } from "@/lib/types";

import styles from "./progress-editor.module.css";

/** Manual page/episode/hour progress for the kinds that are consumed over time. */
export function ProgressEditor({ item }: { item: Item }) {
  const router = useRouter();
  const { t } = useI18n();
  const unit =
    item.kind === "anime" ? "episode" : item.kind === "book" ? "page" : "hour";
  const fallbackTotal =
    item.kind === "anime"
      ? item.details?.number_of_episodes
      : item.kind === "book"
        ? item.details?.page_count
        : null;
  const [current, setCurrent] = useState(
    String(item.details?.progress?.current ?? 0),
  );
  const [total, setTotal] = useState(
    String(item.details?.progress?.total ?? fallbackTotal ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item.details || !["anime", "book", "game"].includes(item.kind)) {
    return null;
  }

  async function save() {
    const currentValue = Number(current);
    const totalValue = total.trim() === "" ? null : Number(total);
    if (
      !Number.isInteger(currentValue) ||
      currentValue < 0 ||
      (totalValue !== null &&
        (!Number.isInteger(totalValue) || totalValue <= 0 || currentValue > totalValue))
    ) {
      setError(t("progress.invalid"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const details: MovieDetails = {
        ...item.details!,
        progress: { current: currentValue, total: totalValue, unit },
      };
      await api.items.update(item.id, { details });
      router.refresh();
    } catch {
      setError(t("progress.error"));
    } finally {
      setBusy(false);
    }
  }

  const label =
    unit === "episode"
      ? t("progress.episodes")
      : unit === "page"
        ? t("progress.pages")
        : t("progress.hours");

  return (
    <Card title={t("progress.title")}>
      <div className={styles.form}>
        <Input
          inputMode="numeric"
          label={label}
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
        <Button disabled={busy} onClick={() => void save()} size="sm" variant="secondary">
          {busy ? t("progress.saving") : t("progress.save")}
        </Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}
