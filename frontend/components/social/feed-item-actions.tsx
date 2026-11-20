"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { FollowButton } from "@/components/social/follow-button";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useToast } from "@/components/toasts";
import { mediaUrl } from "@/lib/media";
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
      const created = await api.items.create(input);
      // A cover belongs to another user's media store; copy it into this
      // account before saving the item so it survives independently.
      if (item.cover_key) {
        try {
          const response = await fetch(mediaUrl(item.cover_key), { credentials: "include" });
          if (response.ok) {
            const blob = await response.blob();
            const file = new File([blob], "recommendation-cover", {
              type: blob.type || "image/webp",
            });
            const upload = await api.uploads.upload(file);
            await api.items.setCover(created.item.id, upload.upload.id);
          }
        } catch {
          // The record is still useful without its cover.
        }
      }
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
      <Button
        disabled={added || busy}
        onClick={() => void add()}
        size="sm"
        title={t("feed.addToMine")}
        variant="secondary"
      >
        {added ? t("feed.added") : t("feed.addToMineShort")}
      </Button>
      {showFollow ? <FollowButton userId={item.author_id} /> : null}
      {onHide ? (
        <button
          className={styles.hide}
          onClick={onHide}
          title={t("recommendations.notInterested")}
          type="button"
        >
          {t("recommendations.hide")}
        </button>
      ) : null}
    </div>
  );
}
