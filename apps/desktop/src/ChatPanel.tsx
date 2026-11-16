import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Card } from "@/components/ui";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type Peer = {
  id: string;
  handle: string;
  display_name: string;
  avatar_key: string | null;
};

type ChatThread = {
  id: string;
  peer: Peer;
  unread: number;
  muted: boolean;
  updated_at: string;
  last_message: { body: string; created_at: string } | null;
};

type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  client_id: string;
  created_at: string;
  pending?: boolean;
};

function invoke(): Invoke {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  if (!api?.core?.invoke) throw new Error("Tauri API is unavailable");
  return api.core.invoke;
}

function asTime(value: string): string {
  const numeric = /^\d+$/.test(value) ? Number(value) : value;
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(numeric));
}

function merge(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byClient = new Map<string, ChatMessage>();
  for (const message of current) byClient.set(message.client_id || message.id, message);
  for (const message of incoming) byClient.set(message.client_id || message.id, message);
  return [...byClient.values()].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );
}

export function ChatPanel({
  userId,
  onUnread,
}: {
  userId: string;
  onUnread: (value: number) => void;
}) {
  const api = invoke();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [active, setActive] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const response = await api<{ threads: ChatThread[] }>("local_chat_threads");
      setThreads(response.threads ?? []);
      onUnread((response.threads ?? []).filter((thread) => !thread.muted).reduce((sum, thread) => sum + thread.unread, 0));
    } catch (cause) {
      setError(String(cause));
    }
  }, [api, onUnread]);

  useEffect(() => {
    void loadThreads();
    const timer = window.setInterval(() => void loadThreads(), 5000);
    window.addEventListener("focus", loadThreads);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", loadThreads);
    };
  }, [loadThreads]);

  const loadMessages = useCallback(async (thread: ChatThread, before?: string) => {
    try {
      const response = await api<{ messages: ChatMessage[]; next_before: string | null }>(
        "local_chat_messages",
        { threadId: thread.id, before: before ?? null, limit: 50 },
      );
      setMessages((current) => merge(before ? current : current.filter((message) => message.pending), response.messages));
      await api("local_chat_read", { threadId: thread.id });
      await loadThreads();
    } catch (cause) {
      setError(String(cause));
    }
  }, [api, loadThreads]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void loadMessages(active), 5000);
    return () => window.clearInterval(timer);
  }, [active, loadMessages]);

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages.length]);

  async function open(thread: ChatThread) {
    setActive(thread);
    setError("");
    try {
      const response = await api<{ thread: ChatThread }>("local_chat_thread", { threadId: thread.id });
      setActive(response.thread);
      await loadMessages(response.thread);
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !text.trim() || busy) return;
    const body = text.trim();
    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: `pending-${clientId}`,
      thread_id: active.id,
      sender_id: userId,
      body,
      client_id: clientId,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);
    setText("");
    setBusy(true);
    try {
      const response = await api<{ message: ChatMessage }>("local_chat_send", {
        threadId: active.id,
        body,
        clientId,
      });
      setMessages((current) =>
        merge(current.filter((message) => message.client_id !== clientId), [response.message]),
      );
      await loadThreads();
    } catch (cause) {
      setMessages((current) =>
        current.map((message) =>
          message.client_id === clientId ? { ...message, pending: false } : message,
        ),
      );
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMute() {
    if (!active) return;
    try {
      await api("local_chat_mute", { threadId: active.id, muted: !active.muted });
      const next = { ...active, muted: !active.muted };
      setActive(next);
      setThreads((current) => current.map((thread) => thread.id === next.id ? next : thread));
      await loadThreads();
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <div className="desktop-chat">
      <aside className="desktop-chat-list">
        <h2>Сообщения</h2>
        {threads.length === 0 ? <p className="desktop-muted">Диалогов пока нет.</p> : null}
        {threads.map((thread) => (
          <button
            className={`desktop-chat-thread ${active?.id === thread.id ? "desktop-chat-thread-active" : ""}`}
            key={thread.id}
            onClick={() => void open(thread)}
            type="button"
          >
            <span className="desktop-chat-avatar">{thread.peer.display_name.slice(0, 1)}</span>
            <span className="desktop-chat-preview">
              <strong>{thread.peer.display_name}</strong>
              <span>{thread.last_message?.body ?? "Нет сообщений"}</span>
            </span>
            {thread.unread > 0 ? <span className="desktop-chat-unread">{thread.unread}</span> : null}
            {thread.muted ? <span className="desktop-chat-muted">mute</span> : null}
          </button>
        ))}
      </aside>

      <section className="desktop-chat-thread-view">
        {active ? (
          <>
            <header className="desktop-chat-head">
              <Button onClick={() => setActive(null)} size="sm" variant="secondary">←</Button>
              <div>
                <strong>{active.peer.display_name}</strong>
                <span>@{active.peer.handle}</span>
              </div>
              <Button onClick={() => void toggleMute()} size="sm" variant="secondary">
                {active.muted ? "Включить звук" : "Без звука"}
              </Button>
            </header>
            <div className="desktop-chat-messages" ref={boxRef}>
              {messages.length === 0 ? <p className="desktop-muted">Сообщений пока нет.</p> : null}
              {messages.map((message) => (
                <div
                  className={`desktop-chat-bubble-row ${message.sender_id === userId ? "desktop-chat-own" : ""}`}
                  key={message.client_id || message.id}
                >
                  <div className="desktop-chat-bubble">
                    {message.body}
                    {message.pending ? <span className="desktop-chat-pending"> · ожидает отправки</span> : null}
                  </div>
                  <time>{asTime(message.created_at)}</time>
                </div>
              ))}
            </div>
            <form className="desktop-chat-composer" onSubmit={send}>
              <textarea
                aria-label="Сообщение"
                onChange={(event) => setText(event.target.value)}
                placeholder="Написать сообщение…"
                rows={2}
                value={text}
              />
              <Button disabled={!text.trim() || busy} type="submit">{busy ? "Отправка…" : "Отправить"}</Button>
            </form>
          </>
        ) : (
          <Card title="Диалог">
            <p className="desktop-muted">Выбери диалог слева. Офлайн-сообщения сохраняются и отправятся после reconnect.</p>
            {error ? <p className="desktop-error">{error}</p> : null}
          </Card>
        )}
      </section>
    </div>
  );
}
