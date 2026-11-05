"use client";

import { useEffect, useState } from "react";

import { IconHeart } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./card-reaction.module.css";

/** Compact like control that sits on a public record card. */
export function CardReaction({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const { user } = useUser();
  const [count, setCount] = useState(0);
  const [reacted, setReacted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.publicItems
      .reactions(itemId)
      .then((response) => {
        if (!cancelled) {
          setCount(response.count);
          setReacted(Boolean(user && response.likers.some((liker) => liker.id === user.id)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [itemId, user]);

  async function toggle() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const response = await api.publicItems.react(itemId);
      setCount(response.count);
      setReacted(response.reacted);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      aria-pressed={reacted}
      className={`${styles.button} ${reacted ? styles.active : ""}`}
      disabled={!user || busy}
      onClick={() => void toggle()}
      title={user ? t("reactions.like") : t("reactions.login")}
      type="button"
    >
      <IconHeart size={13} />
      <span>{count}</span>
    </button>
  );
}
