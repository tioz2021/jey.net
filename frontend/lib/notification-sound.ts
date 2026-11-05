"use client";

let context: AudioContext | null = null;

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

/** Two short tones; safe to call even before the user has interacted. */
export async function playNotificationSound(): Promise<void> {
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
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.16);
  });
}
