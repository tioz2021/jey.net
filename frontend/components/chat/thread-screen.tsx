"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { IconBell, IconBellOff } from "@/components/icons";
import { Avatar } from "@/components/profile/avatar";
import { LoadingScreen } from "@/components/loading-screen";
import { ReportButton } from "@/components/report-button";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";
import { AppLink } from "@/lib/navigation";
import { mediaUrl } from "@/lib/media";
import { useUser } from "@/lib/user-context";
import type { ChatMessage, ChatThread } from "@/lib/types";

import styles from "./thread.module.css";

type PendingMessage = ChatMessage & { pending?: boolean; failed?: boolean };

function messageKey(message: ChatMessage) {
  // The optimistic copy and the server copy share a client_id; prefer it so
  // an SSE event can replace the pending bubble instead of adding a duplicate.
  return message.client_id || message.id;
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byKey = new Map<string, ChatMessage>();
  for (const message of current) byKey.set(messageKey(message), message);
  for (const message of incoming) byKey.set(messageKey(message), message);
  return [...byKey.values()].sort((a, b) => {
    const left = new Date(a.created_at).getTime();
    const right = new Date(b.created_at).getTime();
    return left - right;
  });
}

export function ChatThreadScreen() {
  const { id = "" } = useParams();
  const { t, locale } = useI18n();
  const { user } = useUser();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sseHealthy = useRef(false);

  async function toggleMute() {
    if (!thread) return;
    try {
      const response = thread.muted
        ? await api.chat.unmute(id)
        : await api.chat.mute(id);
      setThread((current) => current ? { ...current, muted: response.muted } : current);
      window.dispatchEvent(new Event("jey:chat-updated"));
    } catch {
      // Keep the current state; the next open retries.
    }
  }

  async function loadThread(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const [threadResponse, messageResponse] = await Promise.all([
        api.chat.thread(id),
        api.chat.messages(id, { limit: 50 }),
      ]);
      setThread(threadResponse.thread);
      setMessages((current) =>
        mergeMessages(
          current.filter((message) => message.pending || message.failed),
          messageResponse.messages,
        ),
      );
      setNextBefore(messageResponse.next_before);
      if (threadResponse.thread.unread > 0) {
        await api.chat.read(id).catch(() => {});
        window.dispatchEvent(new Event("jey:chat-updated"));
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    void loadThread(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/v1/chat/stream`);
    source.onopen = () => {
      sseHealthy.current = true;
    };
    source.onerror = () => {
      sseHealthy.current = false;
    };
    const onCreated = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          thread_id: string;
          message?: ChatMessage;
        };
        if (payload.thread_id !== id || !payload.message) return;
        setMessages((current) => mergeMessages(current, [payload.message!]));
        if (document.visibilityState === "visible") {
          void api.chat.read(id).catch(() => {});
        }
      } catch {
        // Malformed events are ignored; polling remains the fallback.
      }
    };
    const onResync = () => void loadThread(false);
    source.addEventListener("message.created", onCreated);
    source.addEventListener("resync", onResync);
    return () => {
      source.removeEventListener("message.created", onCreated);
      source.removeEventListener("resync", onResync);
      source.close();
      sseHealthy.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const timer = window.setInterval(() => {
      if (sseHealthy.current || document.visibilityState !== "visible") return;
      api.chat
        .messages(id, { limit: 50 })
        .then((response) => {
          setMessages((current) => mergeMessages(current, response.messages));
          setNextBefore(response.next_before);
        })
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [id]);

  useEffect(() => {
    const box = messagesRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages.length]);

  async function loadOlder() {
    if (!nextBefore) return;
    try {
      const response = await api.chat.messages(id, { before: nextBefore, limit: 50 });
      setMessages((current) => mergeMessages(current, response.messages));
      setNextBefore(response.next_before);
    } catch {
      // Keep the current page; the next open can retry.
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending || !user) return;
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: PendingMessage = {
      id: `pending-${clientId}`,
      thread_id: id,
      sender_id: user.id,
      body,
      client_id: clientId,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);
    setText("");
    setSending(true);
    try {
      const response = await api.chat.send(id, body, clientId);
      setMessages((current) =>
        mergeMessages(
          current.filter((message) => message.client_id !== clientId),
          [response.message],
        ),
      );
      window.dispatchEvent(new Event("jey:chat-updated"));
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.client_id === clientId
            ? { ...message, pending: false, failed: true }
            : message,
        ),
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function retryFailed(message: PendingMessage) {
    setMessages((current) =>
      current.filter((entry) => entry.client_id !== message.client_id),
    );
    setText(message.body);
    inputRef.current?.focus();
  }

  if (loading) return <main><LoadingScreen /></main>;
  if (error || !thread) {
    return (
      <main>
        <p className={styles.back}><AppLink href="/messages">← {t("chat.back")}</AppLink></p>
        <Card title={t("chat.loadError")}>
          <p>{t("chat.emptyThread")}</p>
        </Card>
      </main>
    );
  }

  const ownId = user?.id;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <AppLink className={styles.backLink} href="/messages">←</AppLink>
        <AppLink
          className={styles.peer}
          href={`/u/${thread.peer.handle}`}
          title={thread.peer.display_name}
        >
          <Avatar
            name={thread.peer.display_name}
            size={36}
            url={thread.peer.avatar_key ? mediaUrl(thread.peer.avatar_key) : null}
          />
          <span className={styles.identity}>
            <strong>{thread.peer.display_name}</strong>
            <span>@{thread.peer.handle}</span>
          </span>
        </AppLink>
        <button
          aria-label={thread.muted ? t("chat.unmute") : t("chat.muted")}
          aria-pressed={thread.muted}
          className={styles.mute}
          onClick={() => void toggleMute()}
          title={thread.muted ? t("chat.unmute") : t("chat.muted")}
          type="button"
        >
          {thread.muted ? <IconBellOff size={16} /> : <IconBell size={16} />}
        </button>
      </header>

      <div className={styles.messages} ref={messagesRef}>
        {nextBefore ? (
          <Button className={styles.older} onClick={() => void loadOlder()} size="sm" variant="ghost">
            {t("chat.loadOlder")}
          </Button>
        ) : null}
        {messages.length === 0 ? (
          <p className={styles.empty}>{t("chat.emptyThread")}</p>
        ) : (
          messages.map((message) => {
            const own = message.sender_id === ownId;
            return (
              <div
                className={`${styles.message} ${own ? styles.own : ""} ${message.failed ? styles.failed : ""}`}
                key={messageKey(message)}
              >
                <div className={styles.bubble}>
                  {message.body}
                  {message.failed ? (
                    <button className={styles.retry} onClick={() => retryFailed(message)} type="button">
                      {t("chat.retry")}
                    </button>
                  ) : null}
                </div>
                <time dateTime={message.created_at}>
                  {message.pending ? t("chat.sending") : formatDate(locale, message.created_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {!own && !message.pending && !message.failed ? (
                  <div className={styles.report}>
                    <ReportButton
                      ownerId={message.sender_id}
                      targetId={message.id}
                      targetType="chat_message"
                    />
                  </div>
                ) : null}
              </div>
            );
          })
        )}

      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label={t("chat.placeholder")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={t("chat.placeholder")}
          ref={inputRef}
          rows={1}
          value={text}
        />
        <Button disabled={!text.trim() || sending} type="submit">
          {sending ? t("chat.sending") : t("chat.send")}
        </Button>
      </form>
    </main>
  );
}
