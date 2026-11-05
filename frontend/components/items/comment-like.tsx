"use client";

import { useState } from "react";

import { IconHeart, IconHeartFilled } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./comment-like.module.css";

export function CommentLike({
  commentId,
  initialCount,
  initialLiked,
}: {
  commentId: string;
  initialCount: number;
  initialLiked: boolean;
}) {
  const { t } = useI18n();
  const { user } = useUser();
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const response = await api.comments.react(commentId);
      setCount(response.count);
      setLiked(response.reacted);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      aria-label={t("comments.like")}
      aria-pressed={liked}
      className={`${styles.button} ${liked ? styles.active : ""}`}
      disabled={!user || busy}
      onClick={() => void toggle()}
      type="button"
    >
      {liked ? <IconHeartFilled size={12} /> : <IconHeart size={12} />}
      {count > 0 ? <span>{count}</span> : null}
    </button>
  );
}
