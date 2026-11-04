"use client";

import { useState } from "react";

import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

import styles from "./item-review.module.css";

const PREVIEW_LIMIT = 900;

export function ItemReview({
  text,
  title,
}: {
  text: string;
  title?: string;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > PREVIEW_LIMIT;
  const shown = long && !expanded ? `${text.slice(0, PREVIEW_LIMIT).trimEnd()}…` : text;

  return (
    <Card title={title ?? t("item.reviewTitle")}>
      <p className={styles.text}>{shown}</p>
      {long ? (
        <Button
          onClick={() => setExpanded((value) => !value)}
          size="sm"
          variant="ghost"
        >
          {expanded ? t("item.collapseReview") : t("item.readMore")}
        </Button>
      ) : null}
    </Card>
  );
}
