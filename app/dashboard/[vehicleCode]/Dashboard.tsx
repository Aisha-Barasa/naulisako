"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConductorNav } from "@/components/ConductorNav";
import { BellIcon, BoltIcon, CheckIcon, QrIcon } from "@/components/Icons";
import { Plate } from "@/components/Plate";
import { SettingsButton } from "@/components/SettingsButton";
import { alertsEnabled, chime, enableAlerts, notifyIfHidden, primeSpeech, speak, spellOut, vibrate, VIBRATE } from "@/lib/feedback";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { formatNairobiTime } from "@/lib/time";
import { isPaid, type TxStatus } from "@/lib/tx-public";
import type { DashTx, VehicleToday } from "@/lib/dashboard-types";

const RESYNC_MS = 15_000;
const FLASH_MS = 5_000;
const TOAST_MS = 4_000;

type Props = {
  vehicleId: string;
  vehicleCode: string;
  conductorName: string | null;
  routeName: string | null;
  payUrl: string;
  dayStartISO: string;
  initial: VehicleToday;
};

function pickDashTx(row: Record<string, unknown>): DashTx {
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    amount_kes: Number(row.amount_kes),
    amount_sats: row.amount_sats == null ? null : Number(row.amount_sats),
    phone_last3: String(row.phone_last3 ?? ""),
    receipt_last3: row.receipt_last3 ? String(row.receipt_last3) : null,
    status: row.status as TxStatus,
    verified_by_conductor: Boolean(row.verified_by_conductor),
    source: row.source as DashTx["source"],
  };
}

/** Plain, flat status: a small square tag only where it asks for action; text otherwise. */
function StatusLabel({ tx }: { tx: DashTx }) {
  if (tx.status === "processing") {
    return <span className="rounded-md bg-amber-100 px-2.5 py-1 text-base font-bold text-amber-900">Waiting</span>;
  }
  if (tx.status === "failed") return <span className="text-base font-bold text-red-800">Failed</span>;
  if (tx.verified_by_conductor) {
    return (
      <span className="inline-flex items-center gap-1 text-base font-bold text-green-800">
        <CheckIcon className="h-5 w-5" />
        Verified
      </span>
    );
  }
  return <span className="rounded-md bg-matatu px-2.5 py-1 text-base font-bold text-ink">Tap to verify</span>;
}

export function Dashboard({ vehicleId, vehicleCode, conductorName, routeName, payUrl, dayStartISO, initial }: Props) {
  const [txs, setTxs] = useState<DashTx[]>(initial.txs);
  const [totals, setTotals] = useState({
    todayKes: initial.todayKes,
    todaySats: initial.todaySats,
    todayCount: initial.todayCount,
    walletSats: initial.walletSats,
  });
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const statusById = useRef(new Map(initial.txs.map((t) => [t.id, t.status])));
  const alertsOnRef = useRef(false);
  alertsOnRef.current = alertsOn;

  const resync = useCallback(async () => {
    try {
      const res = await fetch(`/api/vehicles/${vehicleCode}/today`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as VehicleToday;
      setTxs(data.txs);
      setTotals((prev) => ({
        todayKes: data.todayKes,
        todaySats: data.todaySats,
        todayCount: data.todayCount,
        walletSats: data.walletSats ?? prev.walletSats,
      }));
      for (const t of data.txs) statusById.current.set(t.id, t.status);
    } catch {
      // offline for a moment
    }
  }, [vehicleCode]);

  // Debounced resync after Realtime events (totals + wallet need the server).
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleResync = useCallback(() => {
    if (resyncTimer.current) clearTimeout(resyncTimer.current);
    resyncTimer.current = setTimeout(() => void resync(), 1_500);
  }, [resync]);

  const announcePaid = useCallback((row: DashTx) => {
    const text = `Paid KES ${row.amount_kes}, phone ending ${row.phone_last3}`;
    setToast(text);
    setTimeout(() => setToast(null), TOAST_MS);
    setAnnouncement(`New payment. KES ${row.amount_kes}. Phone ending ${spellOut(row.phone_last3)}.`);
    vibrate(VIBRATE.success);
    if (alertsOnRef.current) {
      chime();
      speak(`Paid ${row.amount_kes} shillings. Phone ending ${spellOut(row.phone_last3)}.`);
    }
    notifyIfHidden(`Paid: KES ${row.amount_kes}`, `Phone ending ${row.phone_last3}. Tap to open.`);
  }, []);

  const onRow = useCallback(
    (row: DashTx) => {
      if (row.source === "seed" || row.created_at < dayStartISO) return;
      const before = statusById.current.get(row.id);
      statusById.current.set(row.id, row.status);
      setTxs((prev) => [row, ...prev.filter((t) => t.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      if (isPaid(row.status) && (before === undefined || !isPaid(before))) {
        setFlash((f) => ({ ...f, [row.id]: Date.now() }));
        announcePaid(row);
      }
      scheduleResync();
    },
    [announcePaid, dayStartISO, scheduleResync],
  );

  useEffect(() => {
    setAlertsOn(alertsEnabled());
    const sb = getSupabaseBrowser();
    const channel = sb
      .channel(`dash-${vehicleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `vehicle_id=eq.${vehicleId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          onRow(pickDashTx(payload.new as Record<string, unknown>));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
      });
    const timer = setInterval(() => void resync(), RESYNC_MS);
    return () => {
      clearInterval(timer);
      void sb.removeChannel(channel);
    };
  }, [onRow, resync, vehicleId]);

  // Expire flashes.
  useEffect(() => {
    if (!Object.keys(flash).length) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setFlash((f) => Object.fromEntries(Object.entries(f).filter(([, at]) => now - at < FLASH_MS)));
    }, 1_000);
    return () => clearTimeout(t);
  }, [flash]);

  async function verify(tx: DashTx) {
    vibrate(VIBRATE.tap);
    setTxs((prev) => prev.map((t) => (t.id === tx.id ? { ...t, verified_by_conductor: true } : t)));
    setAnnouncement(`Verified. Phone ending ${spellOut(tx.phone_last3)}.`);
    const res = await fetch(`/api/tx/${tx.id}/verify`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setTxs((prev) => prev.map((t) => (t.id === tx.id ? { ...t, verified_by_conductor: false } : t)));
      setAnnouncement("Could not verify. Check your connection and tap again.");
    }
  }

  async function turnOnAlerts() {
    primeSpeech("Payment alerts are on."); // inside the tap, so later fares can be spoken
    const on = await enableAlerts();
    setAlertsOn(on);
    if (on) {
      chime();
      vibrate(VIBRATE.tap);
    }
  }

  const q = query.trim().toUpperCase();
  const matches = useCallback(
    (t: DashTx) => q.length > 0 && (t.phone_last3 === q || (t.receipt_last3 ?? "").toUpperCase() === q),
    [q],
  );
  // Matches float to the top while the conductor is checking.
  const sorted = useMemo(() => (q ? [...txs.filter(matches), ...txs.filter((t) => !matches(t))] : txs), [txs, q, matches]);
  const matchCount = q ? txs.filter(matches).length : 0;

  return (
    <main className="mx-auto max-w-2xl pb-36">
      <header className="flex items-center gap-2 border-b-2 border-ink px-4 py-2.5">
        <Link href="/" className="btn btn-ghost min-h-12 px-3 text-base" aria-label="Back to home">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <Plate code={vehicleCode} size="md" />
          <p className="mt-1 truncate text-sm text-stone-700">
            {conductorName ?? "Conductor"}
            {routeName ? ` · ${routeName}` : ""}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-2">
          <span className={`hidden items-center gap-1.5 text-sm font-bold sm:inline-flex ${live === "live" ? "text-green-800" : "text-stone-600"}`}>
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${live === "live" ? "bg-green-600 motion-safe:animate-pulse" : "bg-stone-400"}`} />
            {live === "live" ? "Live" : live === "connecting" ? "Connecting…" : "Offline"}
          </span>
          <SettingsButton />
        </span>
      </header>

      {/* New payments read out for TalkBack / VoiceOver users. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 rounded-2xl bg-green-800 px-4 py-4 text-center text-xl font-bold text-white shadow-lift motion-safe:animate-pop-in"
        >
          {toast}
        </div>
      ) : null}

      <section aria-label="Today" className="grid grid-cols-3 border-b-2 border-ink bg-matatu text-center">
        <div className="border-r-2 border-ink px-2 py-3">
          <p className="text-xs font-bold uppercase tracking-wider">Today</p>
          <p className="num font-display text-3xl font-extrabold leading-tight">KES {totals.todayKes.toLocaleString()}</p>
          <p className="text-xs">{totals.todayCount} fares</p>
        </div>
        <div className="border-r-2 border-ink px-2 py-3">
          <p className="text-xs font-bold uppercase tracking-wider">Today sats</p>
          <p className="num font-display text-3xl font-extrabold leading-tight">{totals.todaySats.toLocaleString()}</p>
          <p className="text-xs">settled</p>
        </div>
        <div className="px-2 py-3">
          <p className="text-xs font-bold uppercase tracking-wider">Wallet</p>
          <p className="num font-display text-3xl font-extrabold leading-tight">{totals.walletSats === null ? "—" : totals.walletSats.toLocaleString()}</p>
          <p className="text-xs">sats</p>
        </div>
      </section>

      <div className="space-y-3 px-4 pt-4">
        {!alertsOn ? (
          <button type="button" onClick={() => void turnOnAlerts()} className="btn btn-primary w-full text-lg">
            <BellIcon />
            Turn on payment alerts
          </button>
        ) : (
          <p className="flex items-center gap-2 text-base font-semibold text-green-800">
            <BellIcon className="h-5 w-5" />
            Alerts on: sound, vibration and notifications
          </p>
        )}

        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="quick-check" className="label mb-1 block">
              Check a passenger&apos;s code
            </label>
            <input
              id="quick-check"
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/\s/g, "").slice(0, 3))}
              placeholder="149 or BDE"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="quick-check-result"
              className="field py-2 font-display text-3xl font-extrabold uppercase tracking-[0.12em]"
            />
          </div>
          <button type="button" onClick={() => setShowQr(true)} className="btn btn-ink self-end text-lg">
            <QrIcon />
            QR
          </button>
        </div>
        <p id="quick-check-result" role="status" className={`min-h-7 text-lg font-bold ${matchCount ? "text-green-800" : "text-red-800"}`}>
          {q.length === 3 ? (matchCount ? `${matchCount} match${matchCount > 1 ? "es" : ""} for ${q}` : `No payment matches ${q}`) : ""}
        </p>
      </div>

      <h2 className="sr-only">Today&apos;s fares</h2>
      {sorted.length === 0 ? (
        <p className="mx-4 rounded-2xl border-2 border-dashed border-stone-300 px-4 py-10 text-center text-lg text-stone-700">
          No fares yet today. This updates the moment a passenger pays.
        </p>
      ) : (
        <>
          <div aria-hidden="true" className="hidden gap-x-4 px-8 pb-2 text-sm font-semibold text-stone-600 sm:grid sm:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_8.5rem]">
            <span>Phone / receipt</span>
            <span>Fare</span>
            <span>Time</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="space-y-2 px-4">
            {sorted.map((t) => {
              const hit = matches(t);
              const flashing = flash[t.id] !== undefined;
              const canVerify = isPaid(t.status) && !t.verified_by_conductor;
              const rowClass = `grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-2xl border-2 px-4 py-3 text-left sm:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_8.5rem] ${
                hit
                  ? "border-ink bg-matatu-soft"
                  : flashing
                    ? "border-green-700 bg-green-50 motion-safe:animate-flash"
                    : "border-stone-200 bg-white"
              } ${t.status === "failed" ? "opacity-60" : ""}`;
              const cells = (
                <>
                  <span className="num font-display text-4xl font-extrabold leading-none tracking-[0.04em]">
                    <span className="sr-only">Phone ending </span>
                    {t.phone_last3}
                    <span aria-hidden="true" className="mx-2 text-stone-300">
                      /
                    </span>
                    <span className="sr-only">, receipt ending </span>
                    {t.receipt_last3 ?? (
                      <span className="text-stone-500" aria-label="pending">
                        —
                      </span>
                    )}
                  </span>
                  <span className="col-start-1 flex flex-wrap items-center gap-x-3 sm:contents">
                    <span className="num inline-flex items-center gap-1 text-lg font-bold">
                      KES {t.amount_kes.toLocaleString()}
                      {t.status === "settled" ? (
                        <>
                          <BoltIcon className="h-4 w-4 text-stone-600" />
                          <span className="sr-only">, sats in wallet</span>
                        </>
                      ) : null}
                    </span>
                    <span className="num text-lg text-stone-600">{formatNairobiTime(t.created_at)}</span>
                  </span>
                  <span className="col-start-2 row-span-2 row-start-1 justify-self-end sm:col-start-4 sm:row-span-1">
                    <StatusLabel tx={t} />
                  </span>
                </>
              );
              return (
                <li key={t.id}>
                  {canVerify ? (
                    <button
                      type="button"
                      onClick={() => void verify(t)}
                      className={`${rowClass} min-h-20 transition-[transform,background-color] duration-150 ease-out active:scale-[0.99] hover:border-ink`}
                      aria-label={`Verify: KES ${t.amount_kes}, phone ending ${spellOut(t.phone_last3)}${
                        t.receipt_last3 ? `, receipt ending ${spellOut(t.receipt_last3)}` : ""
                      }`}
                    >
                      {cells}
                    </button>
                  ) : (
                    <div className={`${rowClass} min-h-20`}>{cells}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {showQr ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan to pay"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] motion-safe:animate-pop-in"
        >
          <Plate code={vehicleCode} size="lg" />
          <div className="rounded-2xl border-4 border-ink bg-white p-4 shadow-lift">
            <QRCodeSVG value={payUrl} size={300} marginSize={1} level="M" className="h-auto w-[min(80vw,420px)]" />
          </div>
          <p className="font-display text-4xl font-extrabold uppercase">Scan to pay fare</p>
          <p className="text-xl text-stone-700">Changanua ulipe nauli</p>
          <p className="break-all text-center font-mono text-sm text-stone-600">{payUrl}</p>
          <button type="button" autoFocus onClick={() => setShowQr(false)} className="btn btn-ink min-h-14 w-full max-w-sm text-xl">
            Close
          </button>
        </div>
      ) : null}

      <ConductorNav active="fares" vehicleCode={vehicleCode} />
    </main>
  );
}
