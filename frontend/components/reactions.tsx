"use client";

import { useEffect, useState } from "react";

import { IconHeart, IconHeartFilled } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import type { ReactionLiker } from "@/lib/types";

import styles from "./reactions.module.css";

export function Reactions({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const { user } = useUser();
  const [likers, setLikers] = useState<ReactionLiker[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.publicItems
      .reactions(itemId)
      .then((response) => {
        if (!cancelled) {
          setLikers(response.likers);
          setCount(response.count);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const reacted = Boolean(user && likers.some((liker) => liker.id === user.id));

  async function toggle() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const response = await api.publicItems.react(itemId);
      setCount(response.count);
      if (response.reacted) {
        setLikers((current) => [
          { id: user.id, name: user.display_name, avatar: user.avatar_key },
          ...current.filter((liker) => liker.id !== user.id),
        ]);
      } else {
        setLikers((current) => current.filter((liker) => liker.id !== user.id));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.bar}>
      <button
        aria-pressed={reacted}
        className={`${styles.like} ${reacted ? styles.active : ""}`}
        aria-label={user ? t("reactions.like") : t("reactions.login")}
        disabled={!user || busy}
        onClick={() => void toggle()}
        type="button"
      >
        {reacted ? <IconHeartFilled size={15} /> : <IconHeart size={15} />}
        {reacted ? t("reactions.liked") : t("reactions.like")}
        {count > 0 ? <span className={styles.count}>{count}</span> : null}
      </button>

    </div>
  );
}
