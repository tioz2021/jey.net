"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Card, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import type { Comment } from "@/lib/types";

import styles from "./comments.module.css";

export function Comments({ userId, itemId }: { userId: string; itemId: string }) {
  const { t, date } = useI18n();
  const { user } = useUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.comments
      .list(userId, itemId)
      .then((response) => {
        setComments(response.comments);
        setTotal(response.total);
        setNextOffset(response.next_offset);
      })
      .catch(() => setError(t("comments.loadError")))
      .finally(() => setLoading(false));
  }

  async function loadMore() {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const response = await api.comments.list(userId, itemId, nextOffset);
      setComments((current) => [...current, ...response.comments]);
      setTotal(response.total);
      setNextOffset(response.next_offset);
    } catch {
      setError(t("comments.loadError"));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable enough for this page
  }, [userId, itemId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.comments.create(userId, itemId, body.trim(), replyTo?.id);
      setBody("");
      setReplyTo(null);
      load();
    } catch {
      setError(t("comments.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.comments.remove(id);
      load();
    } catch {
      setError(t("comments.deleteError"));
    }
  }

  function renderComment(comment: Comment, reply = false) {
    return (
      <li className={reply ? styles.reply : styles.comment} key={comment.id}>
        <Link href={`/u/${comment.author_id}`}>
          {comment.author_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- local avatar
            <img alt="" className={styles.avatar} src={`/media/${comment.author_avatar}`} />
          ) : (
            <span aria-hidden="true" className={styles.initial}>
              {comment.author_name.trim().charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
        <div className={styles.content}>
          <p className={styles.meta}>
            <Link href={`/u/${comment.author_id}`}>{comment.author_name}</Link>
            <time>{date(comment.created_at)}</time>
          </p>
          <p className={styles.body}>{comment.body}</p>
          <div className={styles.actions}>
            {!reply ? (
              <button onClick={() => setReplyTo(comment)} type="button">
                {t("comments.reply")}
              </button>
            ) : null}
            {user?.id === comment.author_id ? (
              <button onClick={() => void remove(comment.id)} type="button">
                {t("comments.delete")}
              </button>
            ) : null}
          </div>
          {(comment.replies ?? []).length > 0 ? (
            <ul className={styles.replies}>
              {(comment.replies ?? []).map((child) => renderComment(child, true))}
            </ul>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <Card title={t("comments.title", { count: total })}>
      {loading ? <p className={styles.muted}>{t("comments.loading")}</p> : null}
      {!loading && comments.length === 0 ? (
        <p className={styles.muted}>{t("comments.empty")}</p>
      ) : null}
      {comments.length > 0 ? (
        <ul className={styles.list}>{comments.map((comment) => renderComment(comment))}</ul>
      ) : null}
      {nextOffset !== null ? (
        <Button
          className={styles.more}
          loading={loadingMore}
          onClick={() => void loadMore()}
          size="sm"
          variant="secondary"
        >
          {t("comments.loadMore")}
        </Button>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {user ? (
        <form className={styles.form} onSubmit={submit}>
          {replyTo ? (
            <p className={styles.replyTo}>
              {t("comments.replyingTo", { name: replyTo.author_name })}{" "}
              <button onClick={() => setReplyTo(null)} type="button">
                {t("comments.cancelReply")}
              </button>
            </p>
          ) : null}
          <Textarea
            label={t("comments.placeholder")}
            maxLength={2000}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            value={body}
          />
          <Button disabled={!body.trim()} loading={busy} size="sm" type="submit">
            {t("comments.submit")}
          </Button>
        </form>
      ) : (
        <p className={styles.muted}>
          <Link href="/login">{t("comments.login")}</Link>
        </p>
      )}
    </Card>
  );
}
