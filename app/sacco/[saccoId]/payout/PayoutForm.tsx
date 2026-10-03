"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Vehicle = { vehicleCode: string; walletSats: number | null };
type Preview = { kind: "bolt11" | "lightning_address"; bolt11: string; amountSats: number; description: string | null; balanceSats: number };
type Provider = "tando" | "bitcoin.co.ke" | "other";

const isAddress = (s: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.trim().replace(/^lightning:/i, ""));

export function PayoutForm({ saccoId, vehicles }: { saccoId: string; vehicles: Vehicle[] }) {
  const router = useRouter();
  const [vehicleCode, setVehicleCode] = useState(vehicles[0]?.vehicleCode ?? "");
  const [provider, setProvider] = useState<Provider>("tando");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const address = isAddress(destination);
  const selected = vehicles.find((v) => v.vehicleCode === vehicleCode);

  async function call(payload: Record<string, unknown>) {
    const res = await fetch("/api/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saccoId, vehicleCode, ...payload }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Something went wrong");
    return json;
  }

  async function onPreview(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    setPreview(null);
    try {
      setPreview(
        (await call({ action: "preview", destination, amountSats: address ? Number(amount) || undefined : undefined })) as unknown as Preview,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const r = (await call({ action: "pay", bolt11: preview.bolt11, destination, provider })) as { status: string; amountSats: number };
      setDone(r.status === "paid" ? `Paid ${r.amountSats.toLocaleString()} sats.` : `Sent ${r.amountSats.toLocaleString()} sats; still settling.`);
      setPreview(null);
      setDestination("");
      setAmount("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onPreview} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-bold uppercase">Vehicle</span>
            <select
              value={vehicleCode}
              onChange={(e) => {
                setVehicleCode(e.target.value);
                setPreview(null);
              }}
              className="w-full rounded-xl border-2 border-ink bg-white px-3 py-3 text-lg font-bold"
            >
              {vehicles.map((v) => (
                <option key={v.vehicleCode} value={v.vehicleCode}>
                  {v.vehicleCode} · {v.walletSats === null ? "balance unavailable" : `${v.walletSats.toLocaleString()} sats`}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-bold uppercase">Cash out with</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full rounded-xl border-2 border-ink bg-white px-3 py-3 text-lg font-bold"
            >
              <option value="tando">Tando</option>
              <option value="bitcoin.co.ke">bitcoin.co.ke</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-bold uppercase">Lightning invoice or Lightning address</span>
          <textarea
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setPreview(null);
            }}
            rows={3}
            placeholder="lnbc… or name@domain"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border-2 border-ink px-3 py-3 font-mono text-sm"
          />
        </label>

        {address ? (
          <label className="block space-y-1">
            <span className="text-sm font-bold uppercase">Amount (sats)</span>
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/\D/g, ""));
                setPreview(null);
              }}
              inputMode="numeric"
              placeholder="e.g. 5000"
              className="w-full rounded-xl border-2 border-ink px-3 py-3 text-xl font-bold"
            />
            {selected?.walletSats ? (
              <span className="text-sm text-neutral-600">Leave about 1% for routing fees.</span>
            ) : null}
          </label>
        ) : null}

        <button
          type="submit"
          disabled={busy || !destination.trim() || (address && !amount)}
          className="w-full rounded-xl border-2 border-ink bg-white py-3 text-xl font-bold disabled:opacity-50"
        >
          {busy && !preview ? "Checking…" : "Check amount"}
        </button>
      </form>

      {preview ? (
        <section className="space-y-3 rounded-2xl border-4 border-ink bg-matatu p-4">
          <p className="text-sm font-bold uppercase">Confirm payout from {vehicleCode}</p>
          <p className="text-3xl font-black">{preview.amountSats.toLocaleString()} sats</p>
          {preview.description ? <p className="text-base">“{preview.description}”</p> : null}
          <p className="text-base">
            Wallet: {preview.balanceSats.toLocaleString()} sats → about {(preview.balanceSats - preview.amountSats).toLocaleString()} after
          </p>
          {preview.amountSats > preview.balanceSats ? (
            <p className="font-bold text-red-800">Not enough sats in this wallet.</p>
          ) : null}
          <button
            type="button"
            onClick={() => void onPay()}
            disabled={busy || preview.amountSats > preview.balanceSats}
            className="w-full rounded-xl bg-ink py-4 text-xl font-black text-white disabled:opacity-50"
          >
            {busy ? "Paying…" : `Pay ${preview.amountSats.toLocaleString()} sats`}
          </button>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 font-semibold text-red-800">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="rounded-xl border-2 border-green-700 bg-green-50 px-4 py-3 font-semibold text-green-900">
          {done}
        </p>
      ) : null}
    </div>
  );
}
