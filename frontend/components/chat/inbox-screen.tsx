"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { IconBellOff } from "@/components/icons";
import { Avatar } from "@/components/profile/avatar";
import { LoadingScreen } from "@/components/loading-screen";
import { Badge, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";
import { AppLink } from "@/lib/navigation";
import { mediaUrl } from "@/lib/media";
import type { ChatThread } from "@/lib/types";

import styles from "./inbox.module.css";

export function ChatInboxScreen() {
  const { t, locale } = useI18n();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.chat
      .threads()
      .then((response) => {
        if (!cancelled) {
          setThreads(response.threads);
          window.dispatchEvent(new Event("jey:chat-updated"));
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <PageHeader subtitle={t("chat.subtitle")} title={t("chat.title")} />
      <Card>
        {loading ? (
          <LoadingScreen />
        ) : error ? (
          <p className={styles.empty}>{t("error.requestFailed")}</p>
        ) : threads.length === 0 ? (
          <EmptyState
            actionHref="/people"
            actionLabel={t("chat.findPeople")}
            text={t("chat.emptyText")}
            title={t("chat.emptyTitle")}
          />
        ) : (
          <ul className={styles.list}>
            {threads.map((thread) => {
              const message = thread.last_message;
              const preview = message
                ? message.body
                : t("chat.noMessages");
              const date = message
                ? formatDate(locale, message.created_at, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <li key={thread.id}>
                  <AppLink className={styles.row} href={`/messages/${thread.id}`}>
                    <Avatar
                      name={thread.peer.display_name}
                      size={44}
                      url={thread.peer.avatar_key ? mediaUrl(thread.peer.avatar_key) : null}
                    />
                    <span className={styles.body}>
                      <span className={styles.head}>
                        <strong>{thread.peer.display_name}</strong>
                        <span className={styles.handle}>@{thread.peer.handle}</span>
                        {thread.muted ? <IconBellOff size={13} /> : null}
                      </span>
                      <span className={styles.preview}>{preview}</span>
                    </span>
                    <span className={styles.meta}>
                      <span>{date}</span>
                      {thread.unread > 0 ? (
                        <Badge tone="accent">{t("chat.unread", { count: thread.unread })}</Badge>
                      ) : null}
                    </span>
                  </AppLink>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </main>
  );
}
