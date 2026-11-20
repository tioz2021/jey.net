"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { FollowButton } from "@/components/social/follow-button";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useToast } from "@/components/toasts";
import type { NewItem, PublicItem } from "@/lib/types";

import styles from "./feed-item-actions.module.css";

export function FeedItemActions({
  item,
  onHide,
  showFollow = false,
}: {
  item: PublicItem & { author_id: string };
  onHide?: () => void;
  showFollow?: boolean;
}) {
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const input: NewItem = {
        kind: item.kind,
        title: item.title,
        subtitle: item.subtitle,
        year: item.year,
        status: "planned",
        details: item.details ?? null,
        external_source: item.external_source,
        external_id: item.external_id,
      };
      await api.items.create(input);
      setAdded(true);
      notify({ tone: "success", title: t("feed.addedToMine"), text: "", requestId: null });
      window.dispatchEvent(new Event("jey:item-refreshed"));
    } catch (cause) {
      notifyError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.actions}>
      <Button disabled={added || busy} onClick={() => void add()} size="sm" variant="secondary">
        {added ? t("feed.added") : t("feed.addToMine")}
      </Button>
      {showFollow ? <FollowButton userId={item.author_id} /> : null}
      {onHide ? (
        <button className={styles.hide} onClick={onHide} type="button">
          {t("recommendations.notInterested")}
        </button>
      ) : null}
    </div>
  );
}
