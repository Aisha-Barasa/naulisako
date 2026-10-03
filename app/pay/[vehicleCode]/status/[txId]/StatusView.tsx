"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { isPaid, toTxPublic, type TxPublic, type TxRowLike } from "@/lib/tx-public";

const POLL_MS = 4_000;
const CHECK_AGAIN_AFTER_MS = 45_000;

export function StatusView({ initial, vehicleCode }: { initial: TxPublic; vehicleCode: string }) {
  const [tx, setTx] = useState<TxPublic>(initial);
  const [showCheckAgain, setShowCheckAgain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const done = tx.status !== "processing";
  const doneRef = useRef(done);
  doneRef.current = done;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/tx/${initial.id}`, { cache: "no-store" });
      if (res.ok) setTx((await res.json()) as TxPublic);
    } catch {
      // offline for a moment; next poll or Realtime event will catch up
    }
  }, [initial.id]);

  // Realtime first; polling as the fallback for flaky connections.
  useEffect(() => {
    if (done) return;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowser>["channel"]> | null = null;
    try {
      const sb = getSupabaseBrowser();
      channel = sb
        .channel(`tx-${initial.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "transactions", filter: `id=eq.${initial.id}` },
          (payload) => setTx(toTxPublic(payload.new as TxRowLike)),
        )
        .subscribe();
    } catch {
      // Realtime unavailable; polling covers it
    }
    const poll = setInterval(() => {
      if (!doneRef.current) void refresh();
    }, POLL_MS);
    const later = setTimeout(() => setShowCheckAgain(true), CHECK_AGAIN_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(later);
      if (channel) void getSupabaseBrowser().removeChannel(channel);
    };
  }, [done, initial.id, refresh]);

  async function checkAgain() {
    setChecking(true);
    setCheckNote(null);
    try {
      const res = await fetch(`/api/tx/${initial.id}/query`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { pending?: boolean; error?: string };
      if (!res.ok) setCheckNote(json.error ?? "Could not reach M-Pesa. Try again.");
      else if (json.pending) setCheckNote("M-Pesa is still waiting for your PIN.");
      await refresh();
    } finally {
      setChecking(false);
    }
  }

  if (isPaid(tx.status)) {
    const code = tx.receiptLast3;
    return (
      <section className="space-y-5 px-4 py-8 text-center">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-green-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-16 w-16" fill="none" stroke="white" strokeWidth="3.5">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-black">Paid KES {tx.amountKes.toLocaleString()}</h1>
          <p className="text-lg text-neutral-700">Umelipa · {vehicleCode}</p>
        </div>
        <div className="rounded-2xl border-4 border-ink bg-matatu px-4 py-5">
          {code ? (
            <>
              <p className="text-lg font-bold">Show the conductor these 3 characters</p>
              <p className="text-sm text-neutral-800">Onyesha kondakta herufi hizi 3</p>
              <p className="mt-2 font-mono text-6xl font-black tracking-[0.3em]">{code}</p>
              <p className="mt-1 text-sm">End of your M-Pesa receipt</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold">Show the conductor your phone ending</p>
              <p className="text-sm text-neutral-800">Onyesha kondakta tarakimu 3 za mwisho za simu yako</p>
              <p className="mt-2 font-mono text-6xl font-black tracking-[0.3em]">{tx.phoneLast3}</p>
            </>
          )}
        </div>
      </section>
    );
  }

  if (tx.status === "failed") {
    return (
      <section className="space-y-5 px-4 py-8 text-center">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-red-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-14 w-14" fill="none" stroke="white" strokeWidth="3.5">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-black">Payment not completed</h1>
          <p className="text-lg text-neutral-700">Malipo hayakukamilika</p>
        </div>
        {tx.failureReason ? (
          <p className="rounded-xl border-2 border-ink px-4 py-3 text-lg">{tx.failureReason}</p>
        ) : null}
        <p className="text-base">No money was taken. You can try again.</p>
        <Link
          href={`/pay/${vehicleCode}`}
          className="block w-full rounded-2xl border-2 border-ink bg-matatu py-5 text-2xl font-black"
        >
          Try again
          <span className="block text-base font-semibold">Jaribu tena</span>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6 px-4 py-8 text-center">
      <div className="mx-auto h-24 w-24 animate-spin rounded-full border-8 border-neutral-200 border-t-ink" aria-hidden="true" />
      <div>
        <h1 className="text-3xl font-black">Check your phone</h1>
        <p className="text-lg text-neutral-700">Angalia simu yako</p>
      </div>
      <p className="text-xl">
        Enter your M-Pesa PIN to pay <strong>KES {tx.amountKes.toLocaleString()}</strong>.
        <span className="block text-base text-neutral-600">Weka PIN yako ya M-Pesa.</span>
      </p>
      <p aria-live="polite" className="text-base text-neutral-700">
        This page updates by itself.
      </p>
      {showCheckAgain ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={checkAgain}
            disabled={checking}
            className="w-full rounded-2xl border-2 border-ink bg-white py-4 text-xl font-bold disabled:opacity-60"
          >
            {checking ? "Checking…" : "Check again"}
            <span className="block text-base font-semibold">Angalia tena</span>
          </button>
          {checkNote ? <p className="text-base text-neutral-700">{checkNote}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
