// Per-device accessibility and alert preferences, kept in localStorage.
// Every read/write is wrapped: private browsing and some WebViews throw, and
// the app must still work with the defaults.

export type Preference = "readAloud" | "vibrate" | "sound" | "largeText" | "highContrast";

const KEYS: Record<Preference, string> = {
  readAloud: "nauli.readAloud",
  vibrate: "nauli.vibrate",
  sound: "nauli.sound",
  largeText: "nauli.largeText",
  highContrast: "nauli.highContrast",
};

// Feedback on by default so a passenger who can't see the screen still hears
// and feels the result. Display changes are opt-in.
const DEFAULTS: Record<Preference, boolean> = {
  readAloud: true,
  vibrate: true,
  sound: true,
  largeText: false,
  highContrast: false,
};

export function getPreference(pref: Preference): boolean {
  try {
    const v = localStorage.getItem(KEYS[pref]);
    return v === null ? DEFAULTS[pref] : v === "on";
  } catch {
    return DEFAULTS[pref];
  }
}

export function setPreference(pref: Preference, on: boolean): void {
  try {
    localStorage.setItem(KEYS[pref], on ? "on" : "off");
  } catch {
    // Not persisted, still applied for this visit.
  }
  applyDisplayPreferences();
}

export function applyDisplayPreferences(): void {
  const root = document.documentElement;
  if (getPreference("largeText")) root.dataset.text = "large";
  else delete root.dataset.text;
  if (getPreference("highContrast")) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
}

// Inlined in <head> so display preferences apply before first paint.
export const DISPLAY_BOOT_SCRIPT = `try{var d=document.documentElement;if(localStorage.getItem('${KEYS.largeText}')==='on')d.dataset.text='large';if(localStorage.getItem('${KEYS.highContrast}')==='on')d.dataset.contrast='high'}catch(e){}`;
