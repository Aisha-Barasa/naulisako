"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export function PayForm({ vehicleCode, presetFareKes }: { vehicleCode: string; presetFareKes: number }) {
  const router = useRouter();
  const options = fareOptions(presetFareKes);
  const [fare, setFare] = useState<number | "other">(options[0]);
  const [other, setOther] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Passenger's own device: remembering their number is a convenience, not shared state.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHONE_KEY);
      if (saved) setPhone(saved);
    } catch {
      // storage blocked; they just type it
    }
  }, []);

  const amount = fare === "other" ? Number(other) : fare;
  const amountOk = Number.isInteger(amount) && amount >= 1 && amount <= MAX_KES;
  const phoneOk = looksLikeKePhone(phone);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amountOk) return setError(`Enter a fare between KES 1 and ${MAX_KES.toLocaleString()}.`);
    if (!phoneOk) return setError("Enter your M-Pesa number, e.g. 0712 345 678.");
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
      try {
        localStorage.setItem(PHONE_KEY, phone);
      } catch {
        // ignore
      }
      router.push(`/pay/${vehicleCode}/status/${json.txId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 px-4 py-5">
      <fieldset className="space-y-3">
        <legend className="mb-1">
          <span className="block text-2xl font-extrabold">Choose fare</span>
          <span className="block text-base text-neutral-600">Chagua nauli</span>
        </legend>
        <div className="grid grid-cols-3 gap-3">
          {options.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFare(f)}
              aria-pressed={fare === f}
              className={`rounded-xl border-2 border-ink py-4 text-2xl font-black ${
                fare === f ? "bg-ink text-white" : "bg-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFare("other")}
          aria-pressed={fare === "other"}
          className={`w-full rounded-xl border-2 border-ink py-3 text-xl font-bold ${
            fare === "other" ? "bg-ink text-white" : "bg-white"
          }`}
        >
          Other amount
        </button>
        {fare === "other" ? (
          <label className="block">
            <span className="sr-only">Other amount in KES</span>
            <div className="flex items-center rounded-xl border-2 border-ink px-4">
              <span className="text-xl font-bold">KES</span>
              <input
                value={other}
                onChange={(e) => setOther(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoFocus
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-2xl font-bold outline-none"
              />
            </div>
          </label>
        ) : null}
      </fieldset>

      <label className="block space-y-2">
        <span className="block">
          <span className="block text-2xl font-extrabold">M-Pesa number</span>
          <span className="block text-base text-neutral-600">Nambari ya M-Pesa</span>
        </span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          className="w-full rounded-xl border-2 border-ink px-4 py-3 text-2xl font-bold tracking-wide"
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
        className="w-full rounded-2xl border-2 border-ink bg-matatu py-5 text-2xl font-black disabled:opacity-60"
      >
        {submitting ? "Sending…" : `Pay KES ${amountOk ? amount.toLocaleString() : "—"}`}
        <span className="block text-base font-semibold">{submitting ? "Inatuma…" : "Lipa nauli"}</span>
      </button>
      <p className="text-center text-base text-neutral-700">
        You&apos;ll get an M-Pesa prompt on your phone.
        <span className="block text-neutral-600">Utapokea ombi la M-Pesa kwenye simu yako.</span>
      </p>
    </form>
  );
}
