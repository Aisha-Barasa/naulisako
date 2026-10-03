"use client";

import { useState } from "react";
import { Plate } from "@/components/Plate";

type Report = { vehicleCode: string; fares: number; kes: number; njumpUrl: string; relaysOk: string[] };
type Result = { date: string; reports: Report[]; failures: { vehicleCode: string; error: string }[] };

export function NostrPublish({ saccoId, date, dayLabel, npub }: { saccoId: string; date: string; dayLabel: string; npub: string | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/nostr/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saccoId, date }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok && !json.reports?.length) throw new Error(json.error ?? json.failures?.[0]?.error ?? "Publishing failed. Try again.");
      setResult(json as Result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-4 space-y-3 rounded-2xl border-2 border-ink p-4" aria-labelledby="nostr-heading">
      <h2 id="nostr-heading" className="font-display text-2xl font-extrabold uppercase">
        Public daily report
      </h2>
      <p className="max-w-[60ch] text-base leading-relaxed text-stone-700">
        Publishes a signed summary for each vehicle (fares, KES, sats and a fingerprint of the fare list) to public Nostr relays. Anyone can
        check later that the numbers weren&apos;t changed. No phone numbers are published.
      </p>
      <button type="button" onClick={() => void publish()} disabled={busy} className="btn btn-ink w-full text-lg sm:w-auto">
        {busy ? "Publishing…" : `Publish ${dayLabel.toLowerCase()}'s report`}
      </button>

      <div aria-live="polite" className="space-y-2">
        {error ? (
          <p role="alert" className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 font-semibold text-red-900">
            {error}
          </p>
        ) : null}
        {result ? (
          <>
            <p className="text-base font-bold text-green-800">
              Published {result.reports.length} report{result.reports.length === 1 ? "" : "s"} for {result.date}.
            </p>
            <ul className="space-y-2">
              {result.reports.map((r) => (
                <li key={r.vehicleCode} className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-100 px-3 py-2">
                  <Plate code={r.vehicleCode} size="sm" />
                  <span className="num text-base">
                    {r.fares} fares · KES {r.kes.toLocaleString()}
                  </span>
                  <a href={r.njumpUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-11 items-center font-bold underline">
                    View on Nostr
                  </a>
                </li>
              ))}
              {result.failures.map((f) => (
                <li key={f.vehicleCode} className="flex flex-wrap items-center gap-3 rounded-xl bg-red-50 px-3 py-2 text-red-900">
                  <Plate code={f.vehicleCode} size="sm" />
                  <span className="text-base font-semibold">{f.error}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      {npub ? (
        <p className="break-all text-sm text-stone-600">
          Signed by <span className="font-mono">{npub}</span>
        </p>
      ) : null}
    </section>
  );
}
