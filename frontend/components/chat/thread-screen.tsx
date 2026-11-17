"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { IconBell, IconBellOff } from "@/components/icons";
import { Avatar } from "@/components/profile/avatar";
import { LoadingScreen } from "@/components/loading-screen";
import { ReportButton } from "@/components/report-button";
import { useToast } from "@/components/toasts";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";
import { AppLink } from "@/lib/navigation";
import { mediaUrl } from "@/lib/media";
import { useUser } from "@/lib/user-context";
import {
  decryptForDevice,
  encryptToDevices,
  type ChatIdentity,
  type DevicePublicKey,
} from "@/lib/chat-crypto";
import { decodeItemShare } from "@/lib/chat-share";
import { loadIdentity, saveIdentity } from "@/lib/chat-identity";
import type { ChatMessage, ChatSharedItem, ChatThread } from "@/lib/types";

import styles from "./thread.module.css";

type PendingMessage = ChatMessage & { pending?: boolean; failed?: boolean };

const REACTION_EMOJIS = [
  "❤️",
  "👍",
  "😂",
  "😮",
  "😢",
  "🔥",
  "🎉",
  "🙏",
  "👎",
  "💩",
  "🤮",
  "😡",
];

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

function SharedItemCard({ item }: { item: ChatSharedItem }) {
  const { t } = useI18n();
  const content = (
    <>
      {item.cover_key ? (
        <img alt="" className={styles.sharedCover} src={mediaUrl(item.cover_key)} />
      ) : (
        <span className={styles.sharedPlaceholder} aria-hidden="true">↗</span>
      )}
      <span className={styles.sharedText}>
        <small>{t("share.title")}</small>
        <strong>{item.title}</strong>
        <span>{[item.year, item.rating ? `${item.rating}/10` : null].filter(Boolean).join(" · ")}</span>
        {item.review ? <span className={styles.sharedReview}>{item.review}</span> : null}
      </span>
      {item.url ? <span className={styles.sharedOpen}>{t("share.open")} ↗</span> : null}
    </>
  );
  return item.url ? (
    <a
      className={styles.sharedCard}
      href={item.url}
      rel="noreferrer noopener"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className={styles.sharedCard}>{content}</div>
  );
}

export function ChatThreadScreen() {
  const { id = "" } = useParams();
  const { t, locale } = useI18n();
  const { user } = useUser();
  const { notify } = useToast();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<PendingMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [menu, setMenu] = useState<{ message: ChatMessage; x: number; y: number } | null>(null);
  const [reportTarget, setReportTarget] = useState<PendingMessage | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingSentAt = useRef(0);
  const typingTimer = useRef<number | null>(null);
  const searchActiveRef = useRef(false);
  const searchRequest = useRef(0);
  const sseHealthy = useRef(false);
  const identityRef = useRef<ChatIdentity | null>(null);
  const peerDevicesRef = useRef<DevicePublicKey[]>([]);
  const canEncryptRef = useRef(false);
  const [e2eReady, setE2eReady] = useState(false);

  async function prepareCrypto(peerId: string) {
    try {
      const identity = await loadIdentity();
      identityRef.current = identity;
      if (!identity) {
        peerDevicesRef.current = [];
        setE2eReady(false);
        return;
      }
      await api.chat
        .registerDevice({
          device_id: identity.device_id,
          public_key: identity.public_key,
          name: "Browser",
        })
        .catch(() => {});
      const [own, peer] = await Promise.all([
        api.chat.devices().catch(() => ({ devices: [] })),
        api.chat.userDevices(peerId).catch(() => ({ devices: [] })),
      ]);
      const recipients: DevicePublicKey[] = [
        ...peer.devices.map((device) => ({ device_id: device.device_id, public_key: device.public_key })),
        ...own.devices.map((device) => ({ device_id: device.device_id, public_key: device.public_key })),
        { device_id: identity.device_id, public_key: identity.public_key },
      ];
      peerDevicesRef.current = [...new Map(recipients.map((device) => [device.device_id, device])).values()];
      canEncryptRef.current = peer.devices.length > 0;
      setE2eReady(peer.devices.length > 0);
    } catch {
      identityRef.current = null;
      peerDevicesRef.current = [];
      canEncryptRef.current = false;
      setE2eReady(false);
    }
  }

  function withSharedItem(message: PendingMessage, text: string): PendingMessage {
    const share = decodeItemShare(text);
    return share
      ? { ...message, body: share.text, shared_item: share.item }
      : { ...message, body: text, shared_item: null };
  }

  async function decodeMessage(message: ChatMessage): Promise<PendingMessage> {
    if (!message.encrypted) return withSharedItem(message, message.body);
    const identity = identityRef.current;
    if (!identity) return { ...message, body: t("chat.encrypted") };
    const plaintext = await decryptForDevice(identity, message.encrypted, id, message.client_id);
    return withSharedItem(message, plaintext ?? t("chat.encrypted"));
  }

  async function decodeMessages(messages: ChatMessage[]): Promise<PendingMessage[]> {
    return Promise.all(messages.map(decodeMessage));
  }

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

  async function saveEdit(message: ChatMessage) {
    const body = editText.trim();
    if (!body || body === message.body) {
      setEditingId(null);
      return;
    }
    try {
      const identity = identityRef.current;
      const encrypted = identity && canEncryptRef.current
        ? await encryptToDevices(identity, peerDevicesRef.current, body, id, message.client_id)
        : undefined;
      const response = await api.chat.edit(
        id,
        message.id,
        encrypted ? null : body,
        encrypted,
      );
      const decoded = await decodeMessage(response.message);
      setMessages((current) => mergeMessages(current, [decoded]));
      setEditingId(null);
      setEditText("");
    } catch {
      // Keep the editor open so the draft is not lost.
    }
  }

  async function toggleReaction(message: ChatMessage, emoji: string) {
    if (!message.id || message.id.startsWith("pending-")) return;
    try {
      const response = await api.chat.react(id, message.id, emoji);
      const decoded = await decodeMessage(response.message);
      setMessages((current) => mergeMessages(current, [decoded]));
    } catch {
      // A later poll will recover the server state.
    }
  }

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    await searchFor(search.trim());
  }

  async function searchFor(query: string) {
    if (!query) {
      if (searchActiveRef.current) {
        searchActiveRef.current = false;
        setSearchActive(false);
        await loadThread(false);
      }
      return;
    }
    const request = ++searchRequest.current;
    try {
      if (identityRef.current) {
        if (request !== searchRequest.current) return;
        const needle = query.toLocaleLowerCase(locale);
        setMessages((current) => current.filter((message) => message.body.toLocaleLowerCase(locale).includes(needle)));
        searchActiveRef.current = true;
        setSearchActive(true);
        setEditingId(null);
        return;
      }
      const response = await api.chat.messages(id, { q: query, limit: 50 });
      if (request !== searchRequest.current) return;
      setMessages(await decodeMessages(response.messages));
      setNextBefore(response.next_before);
      searchActiveRef.current = true;
      setSearchActive(true);
      setEditingId(null);
    } catch {
      if (request === searchRequest.current) setError(true);
    }
  }

  async function clearSearch() {
    searchRequest.current += 1;
    setSearch("");
    searchActiveRef.current = false;
    setSearchActive(false);
    await loadThread(false);
  }

  function notifyTyping() {
    const now = Date.now();
    if (now - typingSentAt.current < 2000) return;
    typingSentAt.current = now;
    void api.chat.typing(id).catch(() => {});
  }

  function showMenu(message: PendingMessage, x: number, y: number) {
    if (message.pending || message.failed) return;
    setMenu({
      message,
      x: Math.min(x, window.innerWidth - 210),
      y: Math.min(y, window.innerHeight - 240),
    });
  }

  function openMenu(event: React.MouseEvent, message: PendingMessage) {
    event.preventDefault();
    event.stopPropagation();
    showMenu(message, event.clientX, event.clientY);
  }



  async function copyMessage(message: PendingMessage) {
    try {
      await navigator.clipboard.writeText(message.body);
      notify({ tone: "success", title: t("chat.copied"), text: "", requestId: null });
    } catch {
      // Clipboard can be unavailable in an insecure context.
    }
    setMenu(null);
  }

  function startEdit(message: ChatMessage) {
    setEditingId(message.id);
    setEditText(message.body);
  }

  async function loadThread(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const [threadResponse, messageResponse] = await Promise.all([
        api.chat.thread(id),
        api.chat.messages(id, { limit: 50 }),
      ]);
      setThread(threadResponse.thread);
      await prepareCrypto(threadResponse.thread.peer.id);
      const decoded = await decodeMessages(messageResponse.messages);
      setMessages((current) =>
        mergeMessages(
          current.filter((message) => message.pending || message.failed),
          decoded,
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
        void decodeMessage(payload.message).then((decoded) => {
          setMessages((current) => mergeMessages(current, [decoded]));
        });
        if (document.visibilityState === "visible") {
          void api.chat.read(id).catch(() => {});
        }
      } catch {
        // Malformed events are ignored; polling remains the fallback.
      }
    };
    const onUpdated = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          thread_id: string;
          message?: ChatMessage;
        };
        if (payload.thread_id !== id || !payload.message) return;
        void decodeMessage(payload.message).then((decoded) => {
          setMessages((current) => mergeMessages(current, [decoded]));
        });
      } catch {
        // Malformed events are ignored; polling remains the fallback.
      }
    };
    const onTyping = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          thread_id: string;
          typing_by?: string;
        };
        if (payload.thread_id !== id || !payload.typing_by || payload.typing_by === user?.id) return;
        setPeerTyping(true);
        if (typingTimer.current) window.clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => setPeerTyping(false), 3000);
      } catch {
        // Ignore malformed typing events.
      }
    };
    const onResync = () => void loadThread(false);
    source.addEventListener("message.created", onCreated);
    source.addEventListener("message.updated", onUpdated);
    source.addEventListener("typing", onTyping);
    source.addEventListener("resync", onResync);
    return () => {
      source.removeEventListener("message.created", onCreated);
      source.removeEventListener("message.updated", onUpdated);
      source.removeEventListener("typing", onTyping);
      source.removeEventListener("resync", onResync);
      source.close();
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      sseHealthy.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const timer = window.setInterval(() => {
      if (sseHealthy.current || searchActive || document.visibilityState !== "visible") return;
      api.chat
        .messages(id, { limit: 50 })
        .then(async (response) => {
          const decoded = await decodeMessages(response.messages);
          setMessages((current) => mergeMessages(current, decoded));
          setNextBefore(response.next_before);
        })
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [id, searchActive]);

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      if (searchActiveRef.current) {
        searchActiveRef.current = false;
        setSearchActive(false);
        void loadThread(false);
      }
      return;
    }
    const timer = window.setTimeout(() => void searchFor(query), 300);
    return () => window.clearTimeout(timer);
    // loadThread/searchFor intentionally read the current thread state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, id]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  useEffect(() => {
    const box = messagesRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages.length]);

  async function loadOlder() {
    if (!nextBefore) return;
    try {
      const response = await api.chat.messages(id, {
        before: nextBefore,
        limit: 50,
        q: searchActive ? search.trim() : undefined,
      });
      const decoded = await decodeMessages(response.messages);
      setMessages((current) => mergeMessages(current, decoded));
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
      reply_to_id: replyTo?.id ?? null,
      pending: true,
    };
    const replyId = replyTo?.id ?? null;
    setMessages((current) => [...current, optimistic]);
    setText("");
    setReplyTo(null);
    setSending(true);
    try {
      const identity = identityRef.current;
      const encrypted = identity && canEncryptRef.current
        ? await encryptToDevices(identity, peerDevicesRef.current, body, id, clientId)
        : undefined;
      const response = await api.chat.send(
        id,
        encrypted ? null : body,
        clientId,
        encrypted,
        replyId,
      );
      const decoded = await decodeMessage(response.message);
      setMessages((current) =>
        mergeMessages(
          current.filter((message) => message.client_id !== clientId),
          [decoded],
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
  const peerName = thread.peer.display_name;

  function replyPreview(message: PendingMessage) {
    const parent = message.reply_to_id
      ? messages.find((entry) => entry.id === message.reply_to_id)
      : null;
    if (!parent) {
      return { id: null, name: t("chat.messageUnavailable"), text: "" };
    }
    const share = decodeItemShare(parent.body);
    return {
      id: parent.id,
      name: parent.sender_id === ownId ? t("chat.you") : peerName,
      text: share?.text ?? parent.body,
    };
  }

  function scrollToMessage(messageId: string) {
    const escaped = typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(messageId)
      : messageId.replace(/"/g, '\"');
    const element = messagesRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${escaped}"]`,
    );
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add(styles.replyTarget);
    window.setTimeout(() => element.classList.remove(styles.replyTarget), 1400);
  }

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
        <span className={`${styles.cryptoStatus} ${e2eReady ? styles.cryptoOn : ""}`}>
          {e2eReady ? "🔒 E2E" : <AppLink href="/settings">{t("chat.e2eOff")}</AppLink>}
        </span>
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

      <form className={styles.searchRow} onSubmit={(event) => void runSearch(event)}>
        <input
          aria-label={t("chat.searchPlaceholder")}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("chat.searchPlaceholder")}
          type="search"
          value={search}
        />
        <Button size="sm" type="submit">{t("chat.search")}</Button>
        {searchActive ? (
          <Button onClick={() => void clearSearch()} size="sm" type="button" variant="secondary">
            {t("chat.clearSearch")}
          </Button>
        ) : null}
      </form>

      <div className={styles.messages} ref={messagesRef}>
        {nextBefore ? (
          <Button className={styles.older} onClick={() => void loadOlder()} size="sm" variant="ghost">
            {t("chat.loadOlder")}
          </Button>
        ) : null}
        {messages.length === 0 ? (
          <p className={styles.empty}>
            {searchActive ? t("chat.searchEmpty") : t("chat.emptyThread")}
          </p>
        ) : (
          messages.map((message) => {
            const own = message.sender_id === ownId;
            return (
              <div
                className={`${styles.message} ${own ? styles.own : ""} ${message.failed ? styles.failed : ""}`}
                data-message-id={message.id}
                key={messageKey(message)}
              >
                {editingId === message.id ? (
                  <form
                    className={styles.editForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveEdit(message);
                    }}
                  >
                    <textarea
                      aria-label={t("chat.edit")}
                      autoFocus
                      onChange={(event) => setEditText(event.target.value)}
                      rows={3}
                      value={editText}
                    />
                    <div>
                      <Button disabled={!editText.trim()} size="sm" type="submit">{t("chat.saveEdit")}</Button>
                      <Button onClick={() => setEditingId(null)} size="sm" type="button" variant="secondary">
                        {t("chat.cancelEdit")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div
                    className={styles.bubble}
                    onContextMenu={(event) => openMenu(event, message)}
                  >
                    {message.reply_to_id ? (() => {
                      const preview = replyPreview(message);
                      return (
                        <button
                          aria-label={t("chat.jumpToReply")}
                          className={styles.replyQuote}
                          disabled={!preview.id}
                          onClick={() => {
                            if (preview.id) scrollToMessage(preview.id);
                          }}
                          title={preview.id ? t("chat.jumpToReply") : undefined}
                          type="button"
                        >
                          <small>{preview.name}</small>
                          <span>{preview.text}</span>
                        </button>
                      );
                    })() : null}
                    {message.shared_item ? <SharedItemCard item={message.shared_item} /> : message.body}
                    {message.failed ? (
                      <button className={styles.retry} onClick={() => retryFailed(message)} type="button">
                        {t("chat.retry")}
                      </button>
                    ) : null}
                  </div>
                )}
                <time dateTime={message.created_at}>
                  {message.pending ? t("chat.sending") : formatDate(locale, message.created_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {message.edited_at ? ` · ${t("chat.edited")}` : ""}
                </time>
                <div className={styles.reactionRow}>
                  {(message.reactions ?? []).map((reaction) => (
                    <button
                      className={`${styles.reaction} ${reaction.user_ids.includes(ownId ?? "") ? styles.reactionMine : ""}`}
                      key={reaction.emoji}
                      onClick={() => void toggleReaction(message, reaction.emoji)}
                      title={t("chat.react")}
                      type="button"
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}

      </div>

      {peerTyping ? (
        <p className={styles.typing}>{thread.peer.display_name} {t("chat.typing")}</p>
      ) : null}

      {replyTo ? (
        <div className={styles.replyComposer}>
          <div>
            <strong>{t("chat.replyingTo", { name: replyTo.sender_id === ownId ? t("chat.you") : thread.peer.display_name })}</strong>
            <span>{decodeItemShare(replyTo.body)?.text ?? replyTo.body}</span>
          </div>
          <button
            aria-label={t("chat.cancelReply")}
            onClick={() => setReplyTo(null)}
            title={t("chat.cancelReply")}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label={t("chat.placeholder")}
          onChange={(event) => {
            setText(event.target.value);
            if (event.target.value.trim()) notifyTyping();
          }}
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

      {menu ? (
        <div
          className={styles.menuBackdrop}
          onClick={() => setMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className={styles.contextMenu}
            onClick={(event) => event.stopPropagation()}
            style={{ left: menu.x, top: menu.y }}
          >
            <p>{t("chat.more")}</p>
            <button
              onClick={() => {
                setReplyTo(menu.message);
                setMenu(null);
                inputRef.current?.focus();
              }}
              type="button"
            >
              {t("chat.reply")}
            </button>
            <button onClick={() => void copyMessage(menu.message)} type="button">{t("chat.copy")}</button>
            <div className={styles.menuReactions}>
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  aria-label={`${t("chat.react")} ${emoji}`}
                  key={emoji}
                  onClick={() => {
                    void toggleReaction(menu.message, emoji);
                    setMenu(null);
                  }}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
            </div>
            {menu.message.sender_id === ownId ? (
              <button
                onClick={() => {
                  startEdit(menu.message);
                  setMenu(null);
                }}
                type="button"
              >
                {t("chat.edit")}
              </button>
            ) : (
              <button
                onClick={() => {
                  setReportTarget(menu.message);
                  setMenu(null);
                }}
                type="button"
              >
                {t("report.action")}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {reportTarget ? (
        <ReportButton
          onClose={() => setReportTarget(null)}
          open
          ownerId={reportTarget.sender_id}
          targetId={reportTarget.id}
          targetType="chat_message"
        />
      ) : null}
    </main>
  );
}
