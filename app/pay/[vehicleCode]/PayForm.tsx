"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { vibrate, VIBRATE } from "@/lib/feedback";

const PHONE_KEY = "nauli.phone";
const MAX_KES = 5000;

/** Preset plus two common peak-time steps up, e.g. 50 → 50 / 70 / 100. */
function fareOptions(preset: number): number[] {
  return Array.from(new Set([preset, preset + 20, preset + 50])).filter((f) => f >= 1 && f <= MAX_KES);
}

// Same shapes lib/phone.ts accepts; the server re-validates.
function looksLikeKePhone(input: string): boolean {
  return /^(?:\+?254|0)?[17]\d{8}$/.test(input.replace(/[\s\-()]/g, ""));
}

type Props = { vehicleCode: string; presetFareKes: number; fromConductor?: boolean };

export function PayForm({ vehicleCode, presetFareKes, fromConductor = false }: Props) {
  const router = useRouter();
  const options = fareOptions(presetFareKes);
  const [fare, setFare] = useState<number | "other">(options[0]);
  const [other, setOther] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Passenger's own device: remembering their number is a convenience, not shared state.
  // On the conductor's phone it would be a stranger's number, so never load or save it.
  useEffect(() => {
    if (fromConductor) return;
    try {
      const saved = localStorage.getItem(PHONE_KEY);
      if (saved) setPhone(saved);
    } catch {
      // storage blocked; they just type it
    }
  }, [fromConductor]);

  const amount = fare === "other" ? Number(other) : fare;
  const amountOk = Number.isInteger(amount) && amount >= 1 && amount <= MAX_KES;
  const phoneOk = looksLikeKePhone(phone);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amountOk) return setError(`Enter a fare between KES 1 and ${MAX_KES.toLocaleString()}.`);
    if (!phoneOk) {
      return setError(fromConductor ? "Enter the passenger's M-Pesa number, e.g. 0712 345 678." : "Enter your M-Pesa number, e.g. 0712 345 678.");
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleCode, amountKes: amount, phone }),
      });
      const json = (await res.json().catch(() => ({}))) as { txId?: string; error?: string };
      if (!res.ok || !json.txId) throw new Error(json.error ?? "Could not start the payment. Try again.");
      if (!fromConductor) {
        try {
          localStorage.setItem(PHONE_KEY, phone);
        } catch {
          // ignore
        }
      }
      vibrate(VIBRATE.tap);
      router.push(`/pay/${vehicleCode}/status/${json.txId}${fromConductor ? "?from=conductor" : ""}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 px-4 py-5">
      {fromConductor ? (
        <div className="rounded-2xl border-2 border-ink bg-matatu-soft px-4 py-3">
          <h1 className="font-display text-3xl font-extrabold uppercase leading-none">Prompt passenger</h1>
          <p className="mt-1 text-base text-stone-700">
            For a passenger who can&apos;t scan. Enter their number and send the M-Pesa prompt to their phone.
          </p>
        </div>
      ) : null}
      <fieldset className="space-y-3">
        <legend className="mb-1">
          <span className="block font-display text-3xl font-extrabold uppercase">Choose fare</span>
          <span className="block text-base text-stone-600">Chagua nauli</span>
        </legend>
        <div className="grid grid-cols-3 gap-3">
          {options.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFare(f);
                vibrate(VIBRATE.tap);
              }}
              aria-label={`KES ${f}`}
              aria-pressed={fare === f}
              className={`flex min-h-20 flex-col items-center justify-center rounded-xl border-2 border-ink transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.96] ${
                fare === f ? "bg-matatu shadow-[inset_0_0_0_2px_#16130f]" : "bg-white hover:bg-stone-50"
              }`}
            >
              <span className="text-xs font-bold text-stone-700">KES</span>
              <span className="num font-display text-4xl font-extrabold leading-none">{f}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFare("other")}
          aria-pressed={fare === "other"}
          className={`btn w-full text-lg ${fare === "other" ? "bg-matatu shadow-[inset_0_0_0_2px_#16130f]" : "btn-ghost"}`}
        >
          Other amount
        </button>
        {fare === "other" ? (
          <label className="block">
            <span className="sr-only">Other amount in KES</span>
            <div className="flex items-center rounded-xl border-2 border-ink px-4 focus-within:shadow-[0_0_0_4px_rgb(250_204_21/0.55)]">
              <span className="text-lg font-bold text-stone-700">KES</span>
              <input
                value={other}
                onChange={(e) => setOther(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoFocus
                placeholder="0"
                className="num min-w-0 flex-1 bg-transparent px-3 py-2 font-display text-4xl font-extrabold outline-none"
              />
            </div>
          </label>
        ) : null}
      </fieldset>

      <label className="block space-y-2">
        <span className="block">
          <span className="block font-display text-3xl font-extrabold uppercase">
            {fromConductor ? "Passenger's M-Pesa number" : "M-Pesa number"}
          </span>
          <span className="block text-base text-stone-600">{fromConductor ? "Nambari ya M-Pesa ya abiria" : "Nambari ya M-Pesa"}</span>
        </span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          className="field num text-2xl tracking-wide"
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 text-lg font-semibold text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary w-full flex-col gap-0 rounded-2xl py-4"
      >
        <span className="num font-display text-4xl font-extrabold uppercase leading-none">
          {submitting
            ? "Sending…"
            : `${fromConductor ? "Send prompt" : "Pay"} KES ${amountOk ? amount.toLocaleString() : "—"}`}
        </span>
        <span className="text-base font-semibold">{submitting ? "Inatuma…" : fromConductor ? "Tuma ombi" : "Lipa nauli"}</span>
      </button>
      <p className="text-center text-base text-stone-700">
        {fromConductor ? (
          <>
            The passenger gets an M-Pesa prompt on their phone and enters their PIN.
            <span className="block text-stone-600">Abiria atapokea ombi la M-Pesa na kuweka PIN yake.</span>
          </>
        ) : (
          <>
            You&apos;ll get an M-Pesa prompt on your phone.
            <span className="block text-stone-600">Utapokea ombi la M-Pesa kwenye simu yako.</span>
          </>
        )}
      </p>
    </form>
  );
}
