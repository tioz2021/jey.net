"use client";

let context: AudioContext | null = null;
let player: HTMLAudioElement | null = null;

function audioContext(): AudioContext | null {
  const Audio =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return null;
  context ??= new AudioContext();
  return context;
}

/** Must be called from a real click/keypress before autoplay is allowed. */
export function unlockNotificationSound(): void {
  const audio = audioContext();
  if (audio && audio.state === "suspended") {
    void audio.resume();
  }
}

const PLAY_TIMEOUT_MS = 700;

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("audio timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Plays a tiny WAV first, then falls back to a Web Audio tone. */
export async function playNotificationSound(): Promise<void> {
  try {
    player ??= new Audio("/notification.wav");
    player.currentTime = 0;
    player.volume = 0.8;
    await within(player.play(), PLAY_TIMEOUT_MS);
    return;
  } catch {
    // A broken/missing audio backend may never resolve play(); fall through.
    player?.pause();
  }

  const audio = audioContext();
  if (!audio) return;
  try {
    if (audio.state === "suspended") await within(audio.resume(), PLAY_TIMEOUT_MS);
  } catch {
    return;
  }
  if (audio.state !== "running") return;
  const now = audio.currentTime;
  [0, 0.16].forEach((offset, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = index === 0 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.17);
  });
}
