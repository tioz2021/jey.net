// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Set<() => void>>();
  close = vi.fn();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: () => void): void {
    const set = this.listeners.get(name) ?? new Set();
    set.add(listener);
    this.listeners.set(name, set);
  }

  emit(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }
}

describe("notification stream", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("shares one EventSource and replays a recent event to a late listener", async () => {
    const { subscribeToNotifications } = await import("./notification-stream");
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeToNotifications(first);
    expect(FakeEventSource.instances).toHaveLength(1);

    FakeEventSource.instances[0]!.emit("notification");
    expect(first).toHaveBeenCalledTimes(1);

    const unsubscribeSecond = subscribeToNotifications(second);
    await Promise.resolve();
    expect(second).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);

    unsubscribeFirst();
    expect(FakeEventSource.instances[0]!.close).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(FakeEventSource.instances[0]!.close).toHaveBeenCalled();
  });

  it("uses Tauri events instead of EventSource in desktop", async () => {
    const handlers = new Map<string, () => void>();
    const unlisten = vi.fn();
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke },
      event: {
        listen: vi.fn(async (name: string, handler: () => void) => {
          handlers.set(name, handler);
          return unlisten;
        }),
      },
    };
    const { subscribeToNotifications } = await import("./notification-stream");
    const listener = vi.fn();
    const unsubscribe = subscribeToNotifications(listener);
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("local_notification_stream_start");
    handlers.get("jey:notification")?.();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(unlisten).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("local_notification_stream_stop");
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });
});
