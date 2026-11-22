type Listener = () => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let lastEventAt = 0;

const REPLAY_MS = 3000;

function emit(): void {
  lastEventAt = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function ensureSource(): void {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/v1/notifications/stream");
  source.addEventListener("notification", emit);
  source.addEventListener("resync", emit);
}

function closeIfUnused(): void {
  if (listeners.size === 0 && source) {
    source.close();
    source = null;
  }
}

/**
 * One SSE connection shared by the bell, notifications page and feed.
 * A subscriber that arrives just after an event still gets a replay.
 */
export function subscribeToNotifications(listener: Listener): () => void {
  listeners.add(listener);
  ensureSource();
  if (lastEventAt > 0 && Date.now() - lastEventAt < REPLAY_MS) {
    queueMicrotask(listener);
  }
  return () => {
    listeners.delete(listener);
    closeIfUnused();
  };
}
