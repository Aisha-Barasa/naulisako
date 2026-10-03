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
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/** Best installed English voice: Kenyan English, then any English, else the browser default. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase() === "en-ke") ??
    voices.find((v) => /^en[-_](gb|us|za|ng|in)/i.test(v.lang) && v.localService) ??
    voices.find((v) => /^en/i.test(v.lang)) ??
    null
  );
}

function say(text: string, sync = false): void {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = "en-GB";
  }
  u.rate = 0.95;
  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  const go = () => {
    synth.resume(); // Chrome on Android sometimes leaves the queue paused
    synth.speak(u);
  };
  // Inside a tap, iOS needs speak() in the same task. Otherwise Chrome can drop an
  // utterance queued in the same tick as cancel(), so wait a moment after cancelling.
  if (sync || !busy) go();
  else setTimeout(go, 60);
}

/**
 * Read text aloud. `force` ignores the preference (an explicit "Read again" tap).
 * Phones only allow speech after the person has tapped something on the page,
 * so the Pay tap speaks first (primeSpeech) and later results can follow.
 * If the page is hidden (M-Pesa PIN screen on top), wait until it's visible.
 */
export function speak(text: string, opts: { force?: boolean; fromTap?: boolean } = {}): void {
  if (!canSpeak() || (!opts.force && !getPreference("readAloud"))) return;
  try {
    if (document.hidden) {
      const onVisible = () => {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", onVisible);
        say(text);
      };
      document.addEventListener("visibilitychange", onVisible);
      return;
    }
    say(text, opts.fromTap);
  } catch {
    // speech unavailable
  }
}

/** Call inside a tap handler: unlocks speech for this page and loads the voice list. */
export function primeSpeech(text?: string): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.getVoices();
    if (text && getPreference("readAloud")) {
      say(text, true);
    } else {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
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
