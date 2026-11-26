type Listener = () => void;

type TauriApi = {
  core?: { invoke?: (command: string) => Promise<unknown> };
  event?: { listen?: (event: string, handler: () => void) => Promise<() => void> };
};

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let desktopUnlisten: (() => void) | null = null;
let desktopStarting = false;
let lastEventAt = 0;

const REPLAY_MS = 3000;

function emit(): void {
  lastEventAt = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function tauriApi(): TauriApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { __TAURI__?: TauriApi }).__TAURI__;
  return api?.core?.invoke && api.event?.listen ? api : null;
}

function ensureDesktop(api: TauriApi): void {
  if (desktopUnlisten || desktopStarting) return;
  desktopStarting = true;
  void api
    .event!.listen!("jey:notification", emit)
    .then((unlisten) => {
      desktopUnlisten = unlisten;
      if (listeners.size === 0) {
        unlisten();
        desktopUnlisten = null;
        return;
      }
      return api.core!.invoke!("local_notification_stream_start");
    })
    .catch(() => {
      // The regular polling fallback in the bell/feed remains active.
      desktopUnlisten?.();
      desktopUnlisten = null;
    })
    .finally(() => {
      desktopStarting = false;
    });
}

function ensureSource(): void {
  const desktop = tauriApi();
  if (desktop) {
    ensureDesktop(desktop);
    return;
  }
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/v1/notifications/stream");
  source.addEventListener("notification", emit);
  source.addEventListener("resync", emit);
}

function closeIfUnused(): void {
  if (listeners.size !== 0) return;
  const desktop = tauriApi();
  if (desktop) {
    const unlisten = desktopUnlisten;
    desktopUnlisten = null;
    unlisten?.();
    void desktop.core!.invoke!("local_notification_stream_stop").catch(() => undefined);
  }
  if (source) {
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
