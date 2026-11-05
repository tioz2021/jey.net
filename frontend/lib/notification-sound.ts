"use client";

let context: AudioContext | null = null;
let player: HTMLAudioElement | null = null;

function audioContext(): AudioContext | null {
  const Audio =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return null;
  context ??= new Audio();
  return context;
}

/** Must be called from a real click/keypress before autoplay is allowed. */
export function unlockNotificationSound(): void {
  const audio = audioContext();
  if (audio && audio.state === "suspended") {
    void audio.resume();
  }
}

/** Plays a tiny WAV first, then falls back to a Web Audio tone. */
export async function playNotificationSound(): Promise<void> {
  try {
    player ??= new Audio("/notification.wav");
    player.currentTime = 0;
    player.volume = 0.8;
    await player.play();
    return;
  } catch {
    // Fall through: some browsers only allow the Web Audio path.
  }

  const audio = audioContext();
  if (!audio) return;
  try {
    if (audio.state === "suspended") await audio.resume();
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
