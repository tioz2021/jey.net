// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

describe("notification sound", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls back to Web Audio when the WAV cannot play", async () => {
    const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
    const context = {
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        const oscillator = {
          type: "sine",
          frequency: { value: 0 },
          connect: () => ({ connect: () => undefined }),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: (target: unknown) => target,
      }),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    class FakeAudioContext {
      state = context.state;
      currentTime = context.currentTime;
      destination = context.destination;
      createOscillator = context.createOscillator;
      createGain = context.createGain;
      resume = context.resume;
    }

    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal(
      "Audio",
      class {
        currentTime = 0;
        volume = 0;
        play = vi.fn().mockRejectedValue(new Error("no audio backend"));
        pause = vi.fn();
      },
    );

    const { playNotificationSound } = await import("./notification-sound");
    await playNotificationSound();
    expect(oscillators).toHaveLength(2);
  });

  it("never creates Web Audio inside the desktop shell", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("__TAURI__", { core: { invoke } });
    const Context = vi.fn(() => {
      throw new Error("AudioContext must not run in desktop");
    });
    vi.stubGlobal("AudioContext", Context);
    vi.stubGlobal(
      "Audio",
      class {
        currentTime = 0;
        volume = 0;
        play = vi.fn().mockRejectedValue(new Error("no audio backend"));
        pause = vi.fn();
      },
    );

    const { playNotificationSound } = await import("./notification-sound");
    await playNotificationSound();
    expect(invoke).toHaveBeenCalledWith("local_test_sound");
    expect(Context).not.toHaveBeenCalled();
  });
});
