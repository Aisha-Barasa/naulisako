"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { canSpeak, speak, spellOut, vibrate, VIBRATE } from "@/lib/feedback";
import { formatPlate } from "@/components/Plate";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { isPaid, toTxPublic, type TxPublic, type TxRowLike } from "@/lib/tx-public";

const POLL_MS = 4_000;
const AUTO_QUERY_AFTER_MS = 30_000; // sandbox callbacks often never arrive: ask M-Pesa once by ourselves
const CHECK_AGAIN_AFTER_MS = 45_000;

/** What gets read aloud / announced for a finished payment. */
function resultMessage(tx: TxPublic, vehicleCode: string, fromConductor: boolean): string {
  const plate = formatPlate(vehicleCode);
  if (isPaid(tx.status)) {
    const receipt = tx.receiptLast3 ? ` Receipt ending ${spellOut(tx.receiptLast3)}.` : "";
    return fromConductor
      ? `Passenger paid ${tx.amountKes} shillings. Phone ending ${spellOut(tx.phoneLast3)}.${receipt}`
      : `Payment successful. ${tx.amountKes} shillings paid to ${plate}. Tell the conductor: phone ending ${spellOut(tx.phoneLast3)}.${receipt}`;
  }
  return `Payment not completed. ${tx.failureReason ?? ""} No money was taken.`;
}

type Props = { initial: TxPublic; vehicleCode: string; fromConductor?: boolean };

export function StatusView({ initial, vehicleCode, fromConductor = false }: Props) {
  const [tx, setTx] = useState<TxPublic>(initial);
  const [liveText, setLiveText] = useState("");
  const announced = useRef(initial.status !== "processing"); // don't replay old results on reload
  const [showCheckAgain, setShowCheckAgain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const done = tx.status !== "processing";
  // Paid via STK query has no receipt yet; a late callback may still bring it.
  const final = tx.status === "failed" || (isPaid(tx.status) && tx.receiptLast3 !== null);
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
    if (final) return;
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
    const autoQuery = setTimeout(() => {
      if (!doneRef.current) void fetch(`/api/tx/${initial.id}/query`, { method: "POST" }).then(refresh, () => undefined);
    }, AUTO_QUERY_AFTER_MS);
    const later = setTimeout(() => setShowCheckAgain(true), CHECK_AGAIN_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(autoQuery);
      clearTimeout(later);
      if (channel) void getSupabaseBrowser().removeChannel(channel);
    };
  }, [final, initial.id, refresh]);

  // The moment a payment finishes here: vibrate, read it aloud, announce to screen readers.
  useEffect(() => {
    if (tx.status === "processing" || announced.current) return;
    announced.current = true;
    const message = resultMessage(tx, vehicleCode, fromConductor);
    setLiveText(message);
    vibrate(isPaid(tx.status) ? VIBRATE.success : VIBRATE.failure);
    speak(message);
  }, [tx, vehicleCode, fromConductor]);

  // Decided after mount: the server can't know, and a mismatch would break hydration.
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => setSpeechOk(canSpeak()), []);
  const readAgain = () => speak(resultMessage(tx, vehicleCode, fromConductor), { force: true, fromTap: true });
  const liveRegion = (
    <p aria-live="assertive" className="sr-only">
      {liveText}
    </p>
  );
  const readAgainButton = speechOk ? (
    <button type="button" onClick={readAgain} className="btn btn-ghost min-h-14 w-full text-lg">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
      Read again
    </button>
  ) : null;
  const againHref = `/pay/${vehicleCode}${fromConductor ? "?from=conductor" : ""}`;

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
      <section className="space-y-6 px-4 py-7">
        <div className="flex items-center gap-4">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-green-700 shadow-lift motion-safe:animate-pop-in"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="white" strokeWidth="3.5">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="24"
                className="motion-safe:animate-draw-check motion-safe:[stroke-dashoffset:24]"
              />
            </svg>
          </div>
          <div>
            <h1 className="num font-display text-4xl font-extrabold uppercase leading-none">Paid KES {tx.amountKes.toLocaleString()}</h1>
            <p className="mt-1 text-lg text-stone-700">Umelipa · {vehicleCode}</p>
          </div>
        </div>

        <div className="rounded-2xl border-[3px] border-ink bg-matatu p-4 motion-safe:animate-pop-in motion-safe:[animation-delay:260ms]">
          <h2 className="text-lg font-bold leading-tight">
            Tell the conductor <span className="font-semibold text-ink/75">· Mwambie kondakta</span>
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white px-3 py-3">
              <dt className="text-sm font-bold">
                Phone ends <span className="block text-xs font-semibold text-stone-600">Simu yako</span>
              </dt>
              <dd className="num mt-1 font-display text-6xl font-extrabold leading-none tracking-[0.08em]">{tx.phoneLast3}</dd>
            </div>
            <div className="rounded-xl bg-white px-3 py-3">
              <dt className="text-sm font-bold">
                M-Pesa receipt <span className="block text-xs font-semibold text-stone-600">Risiti ya M-Pesa</span>
              </dt>
              {code ? (
                <dd className="mt-1 font-display text-6xl font-extrabold leading-none tracking-[0.08em]">{code}</dd>
              ) : (
                <dd className="mt-3 text-base font-semibold text-stone-600">Arriving shortly</dd>
              )}
            </div>
          </dl>
        </div>
        {fromConductor ? (
          <Link href={againHref} className="btn btn-primary min-h-16 w-full text-xl">
            Prompt another passenger
          </Link>
        ) : (
          <p className="text-base text-stone-700">
            Say these to the conductor. Your phone stays with you.
            <span className="block text-stone-600">Mwambie kondakta tarakimu hizi. Simu yako inabaki nawe.</span>
          </p>
        )}
        {readAgainButton}
        {liveRegion}
      </section>
    );
  }

  if (tx.status === "failed") {
    return (
      <section className="space-y-6 px-4 py-7">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-red-700" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth="3.5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-none">Not completed</h1>
            <p className="mt-1 text-lg text-stone-700">Malipo hayakukamilika</p>
          </div>
        </div>
        {tx.failureReason ? (
          <p className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 text-lg font-semibold text-red-900">{tx.failureReason}</p>
        ) : null}
        <p className="text-base text-stone-700">No money was taken. You can try again.</p>
        <Link href={againHref} className="btn btn-primary min-h-16 w-full flex-col gap-0 rounded-2xl py-4">
          <span className="font-display text-3xl font-extrabold uppercase leading-none">Try again</span>
          <span className="text-base font-semibold">Jaribu tena</span>
        </Link>
        {readAgainButton}
        {liveRegion}
      </section>
    );
  }

  return (
    <section className="space-y-6 px-4 py-7">
      <div className="flex items-center gap-4">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-matatu motion-safe:animate-ping motion-safe:[animation-duration:1.6s]" />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-ink bg-matatu">
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
              <path d="M11 18.5h2" />
            </svg>
          </span>
        </div>
        <div>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none">
            {fromConductor ? "Waiting for passenger" : "Check your phone"}
          </h1>
          <p className="mt-1 text-lg text-stone-700">{fromConductor ? "Abiria aweke PIN" : "Angalia simu yako"}</p>
        </div>
      </div>
      <p className="text-xl leading-snug">
        {fromConductor ? "The passenger enters their M-Pesa PIN to pay" : "Enter your M-Pesa PIN to pay"}{" "}
        <strong className="num">KES {tx.amountKes.toLocaleString()}</strong>.
        <span className="block text-base text-stone-600">{fromConductor ? "Abiria aweke PIN ya M-Pesa." : "Weka PIN yako ya M-Pesa."}</span>
      </p>
      <p aria-live="polite" className="text-base text-stone-700">
        This page updates by itself.
      </p>
      {showCheckAgain ? (
        <div className="space-y-2">
          <button type="button" onClick={checkAgain} disabled={checking} className="btn btn-ghost w-full flex-col gap-0 rounded-2xl py-3">
            <span className="text-xl">{checking ? "Checking…" : "Check again"}</span>
            <span className="text-base font-semibold text-stone-600">Angalia tena</span>
          </button>
          {checkNote ? <p className="text-base text-stone-700">{checkNote}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
