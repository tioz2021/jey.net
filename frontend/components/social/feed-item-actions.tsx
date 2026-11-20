"use client";

import { useEffect, useState } from "react";

import {
  IconCheck,
  IconHeart,
  IconHeartFilled,
  IconPlus,
  IconX,
} from "@/components/icons";
import { useToast } from "@/components/toasts";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { mediaUrl } from "@/lib/media";
import type { NewItem, PublicItem } from "@/lib/types";
import { useUser } from "@/lib/user-context";

import styles from "./feed-item-actions.module.css";

export function FeedItemActions({
  item,
  onHide,
}: {
  item: PublicItem;
  onHide?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useUser();
  const { notify, notifyError } = useToast();
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.publicItems
      .reactions(item.id)
      .then((response) => {
        if (!cancelled) {
          setLiked(Boolean(user && response.likers.some((liker) => liker.id === user.id)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.id, user]);

  async function toggleLike() {
    if (!user || likeBusy) return;
    setLikeBusy(true);
    try {
      const response = await api.publicItems.react(item.id);
      setLiked(response.reacted);
    } catch (cause) {
      notifyError(cause);
    } finally {
      setLikeBusy(false);
    }
  }

  async function add() {
    setAddBusy(true);
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
      setAddBusy(false);
    }
  }

  return (
    <div className={styles.actions}>
      <button
        aria-label={t("reactions.like")}
        aria-pressed={liked}
        className={styles.icon}
        disabled={!user || likeBusy}
        onClick={() => void toggleLike()}
        title={t("reactions.like")}
        type="button"
      >
        {liked ? <IconHeartFilled size={15} /> : <IconHeart size={15} />}
      </button>
      <button
        aria-label={t("feed.addToMine")}
        className={styles.icon}
        disabled={added || addBusy}
        onClick={() => void add()}
        title={added ? t("feed.added") : t("feed.addToMine")}
        type="button"
      >
        {added ? <IconCheck size={15} /> : <IconPlus size={15} />}
      </button>
      {onHide ? (
        <button
          aria-label={t("recommendations.notInterested")}
          className={styles.icon}
          onClick={onHide}
          title={t("recommendations.notInterested")}
          type="button"
        >
          <IconX size={15} />
        </button>
      ) : null}
    </div>
  );
}
