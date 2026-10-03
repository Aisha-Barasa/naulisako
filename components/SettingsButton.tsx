"use client";

import { useEffect, useId, useState } from "react";
import { canSpeak, speak, vibrate, VIBRATE } from "@/lib/feedback";
import { getPreference, setPreference, type Preference } from "@/lib/preferences";

const OPTIONS: { pref: Preference; label: string; hint: string }[] = [
  { pref: "largeText", label: "Larger text", hint: "Makes all text bigger" },
  { pref: "highContrast", label: "High contrast", hint: "Darker text and thicker outlines" },
  { pref: "readAloud", label: "Read results aloud", hint: "Speaks payment results" },
  { pref: "vibrate", label: "Vibrate", hint: "Buzzes when a payment completes" },
  { pref: "sound", label: "Payment sound", hint: "Chime on the conductor screen" },
];

/** Header button that opens an inline accessibility panel (not a modal). */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Preference, boolean> | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(OPTIONS.map((o) => [o.pref, getPreference(o.pref)])) as Record<Preference, boolean>);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle(pref: Preference) {
    if (!values) return;
    const next = !values[pref];
    setPreference(pref, next);
    setValues({ ...values, [pref]: next });
    if (next && pref === "vibrate") vibrate(VIBRATE.tap);
    if (next && pref === "readAloud") speak("Results will be read aloud.", { force: true });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="btn btn-ghost min-h-12 gap-1.5 px-3 text-base"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="4.5" r="1.8" />
          <path d="M5 8.5h14M12 8.5V14m0 0-3.5 6.5M12 14l3.5 6.5" />
        </svg>
        <span>Access</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Accessibility settings"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-2 border-ink bg-white p-3 shadow-lift motion-safe:animate-pop-in"
        >
          <h2 className="px-1 pb-2 text-lg font-bold">Accessibility</h2>
          <ul className="space-y-1.5">
            {OPTIONS.filter((o) => o.pref !== "readAloud" || canSpeak()).map((o) => {
              const on = values?.[o.pref] ?? false;
              return (
                <li key={o.pref}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle(o.pref)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 hover:bg-stone-100 active:bg-stone-100"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold">{o.label}</span>
                      <span className="block text-sm text-stone-600">{o.hint}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`relative h-8 w-14 shrink-0 rounded-full border-2 border-ink transition-colors duration-150 ${on ? "bg-ink" : "bg-white"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-6 w-6 rounded-full transition-transform duration-150 ease-out ${
                          on ? "translate-x-[1.6rem] bg-matatu" : "translate-x-0.5 bg-stone-300"
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-ink mt-2 w-full">
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
