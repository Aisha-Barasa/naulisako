// Non-visual feedback: speech, vibration, chime, background notification.
// Each respects the person's preference. Browsers only allow sound and the
// notification prompt after a tap, so enableAlerts() runs from a click.

import { getPreference } from "./preferences";

let audioCtx: AudioContext | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

export const VIBRATE = {
  success: [200, 100, 200],
  failure: [600],
  tap: [30],
} as const;

export function vibrate(pattern: readonly number[]): void {
  if (!getPreference("vibrate")) return;
  try {
    navigator.vibrate?.([...pattern]); // Android; iOS ignores it
  } catch {
    // unsupported
  }
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Read text aloud. `force` ignores the preference (for an explicit "Read again" tap). */
export function speak(text: string, opts: { force?: boolean; lang?: string } = {}): void {
  if (!canSpeak() || (!opts.force && !getPreference("readAloud"))) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang ?? "en-KE";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    // speech unavailable
  }
}

/** "149" → "1 4 9", so a screen reader or TTS reads digits, not "one hundred forty-nine". */
export function spellOut(s: string): string {
  return s.split("").join(" ");
}

export async function enableAlerts(): Promise<boolean> {
  try {
    audioCtx ??= new AudioContext();
    await audioCtx.resume();
  } catch {
    audioCtx = null;
  }
  if ("Notification" in window && "serviceWorker" in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register("/sw.js");
      if (Notification.permission === "default") await Notification.requestPermission();
    } catch {
      // notifications unavailable; sound and vibration still work
    }
  }
  return alertsEnabled();
}

export function alertsEnabled(): boolean {
  return audioCtx?.state === "running";
}

/** Two short tones, generated so there's no audio file. */
export function chime(): void {
  if (!getPreference("sound") || !audioCtx || audioCtx.state !== "running") return;
  const start = audioCtx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    const t = start + i * 0.15;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/** System notification, only when the page is in the background (on screen, the banner covers it). */
export function notifyIfHidden(title: string, body: string): void {
  if (!swRegistration || !document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
  void swRegistration.showNotification(title, {
    body,
    tag: "fare-paid",
    data: { url: window.location.pathname },
  });
}
