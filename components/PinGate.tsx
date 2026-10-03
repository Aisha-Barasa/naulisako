"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PinGate({ title }: { title: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError(res?.status === 401 ? "Wrong PIN" : "Could not check the PIN. Try again.");
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold uppercase">{title}</h1>
      <p className="text-base text-stone-700">Enter the demo PIN to continue.</p>
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        type="password"
        inputMode="numeric"
        autoFocus
        aria-label="PIN"
        className="field text-2xl tracking-[0.3em]"
      />
      {error ? <p role="alert" className="font-semibold text-red-800">{error}</p> : null}
      <button type="submit" disabled={busy || !pin} className="btn btn-ink w-full text-xl">
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
