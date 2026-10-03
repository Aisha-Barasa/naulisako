"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { formatNairobiTime } from "@/lib/time";
import { isPaid, type TxStatus } from "@/lib/tx-public";
import type { DashTx, VehicleToday } from "@/lib/dashboard-types";

const RESYNC_MS = 15_000;
const FLASH_MS = 5_000;

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

const BADGE: Record<TxStatus, { label: string; cls: string }> = {
  processing: { label: "Waiting", cls: "bg-amber-100 text-amber-900 border-amber-700" },
  fulfilled: { label: "Paid", cls: "bg-green-100 text-green-900 border-green-700" },
  settled: { label: "Paid ⚡", cls: "bg-green-100 text-green-900 border-green-700" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-900 border-red-700" },
};

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
  const [soundOn, setSoundOn] = useState(false);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const audioRef = useRef<AudioContext | null>(null);
  const statusById = useRef(new Map(initial.txs.map((t) => [t.id, t.status])));

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    // Two short tones, no audio file.
    [0, 0.18].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 880 : 1320;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.16);
    });
  }, []);

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

  const onRow = useCallback(
    (row: DashTx) => {
      if (row.source === "seed" || row.created_at < dayStartISO) return;
      const before = statusById.current.get(row.id);
      statusById.current.set(row.id, row.status);
      setTxs((prev) => {
        const rest = prev.filter((t) => t.id !== row.id);
        return [row, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
      if (isPaid(row.status) && (before === undefined || !isPaid(before))) {
        setFlash((f) => ({ ...f, [row.id]: Date.now() }));
        beep();
      }
      scheduleResync();
    },
    [beep, dayStartISO, scheduleResync],
  );

  useEffect(() => {
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

  async function verify(id: string) {
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, verified_by_conductor: true } : t)));
    const res = await fetch(`/api/tx/${id}/verify`, { method: "POST" }).catch(() => null);
    if (!res?.ok) setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, verified_by_conductor: false } : t)));
  }

  function enableSound() {
    try {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
      setSoundOn(true);
      beep();
    } catch {
      setSoundOn(false);
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
    <main className="mx-auto max-w-2xl pb-10">
      <header className="flex items-center gap-3 border-b-2 border-ink px-4 py-3">
        <Logo />
        <div className="min-w-0">
          <p className="text-2xl font-black tracking-wider">{vehicleCode}</p>
          <p className="truncate text-sm text-neutral-700">
            {conductorName ?? "Conductor"}
            {routeName ? ` · ${routeName}` : ""}
          </p>
        </div>
        <span
          className={`ml-auto rounded-full border-2 px-3 py-1 text-sm font-bold ${
            live === "live" ? "border-green-700 text-green-800" : "border-neutral-400 text-neutral-600"
          }`}
        >
          {live === "live" ? "● Live" : live === "connecting" ? "Connecting…" : "Offline · retrying"}
        </span>
      </header>

      <section className="grid grid-cols-3 border-b-2 border-ink bg-matatu text-center">
        <div className="border-r-2 border-ink px-2 py-3">
          <p className="text-xs font-bold uppercase">Today</p>
          <p className="text-2xl font-black">KES {totals.todayKes.toLocaleString()}</p>
          <p className="text-xs">{totals.todayCount} fares</p>
        </div>
        <div className="border-r-2 border-ink px-2 py-3">
          <p className="text-xs font-bold uppercase">Today sats</p>
          <p className="text-2xl font-black">{totals.todaySats.toLocaleString()}</p>
          <p className="text-xs">settled</p>
        </div>
        <div className="px-2 py-3">
          <p className="text-xs font-bold uppercase">Wallet</p>
          <p className="text-2xl font-black">{totals.walletSats === null ? "—" : totals.walletSats.toLocaleString()}</p>
          <p className="text-xs">sats</p>
        </div>
      </section>

      <section className="flex flex-wrap gap-2 px-4 py-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Quick check: last 3 of phone or receipt</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/\s/g, "").slice(0, 3))}
            placeholder="Check 3 chars"
            autoCapitalize="characters"
            autoComplete="off"
            className="w-full rounded-xl border-2 border-ink px-4 py-3 font-mono text-2xl font-bold uppercase tracking-widest"
          />
        </label>
        <button type="button" onClick={() => setShowQr(true)} className="rounded-xl border-2 border-ink bg-ink px-4 py-3 text-lg font-bold text-white">
          Show QR
        </button>
        {!soundOn ? (
          <button type="button" onClick={enableSound} className="rounded-xl border-2 border-ink bg-white px-4 py-3 text-lg font-bold">
            🔔 Sound on
          </button>
        ) : null}
        {q.length === 3 ? (
          <p className={`w-full text-lg font-bold ${matchCount ? "text-green-800" : "text-red-800"}`}>
            {matchCount ? `${matchCount} match${matchCount > 1 ? "es" : ""} for ${q}` : `No payment matches ${q}`}
          </p>
        ) : null}
      </section>

      <ul className="space-y-2 px-4">
        {sorted.length === 0 ? (
          <li className="rounded-xl border-2 border-dashed border-neutral-400 px-4 py-8 text-center text-lg text-neutral-700">
            No payments yet today. Show the QR to passengers.
          </li>
        ) : null}
        {sorted.map((t) => {
          const badge = BADGE[t.status];
          const hit = matches(t);
          const flashing = flash[t.id] !== undefined;
          return (
            <li
              key={t.id}
              className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 transition-colors ${
                hit ? "border-ink bg-matatu" : flashing ? "animate-pulse border-green-700 bg-green-100" : "border-neutral-300 bg-white"
              } ${t.status === "failed" ? "opacity-60" : ""}`}
            >
              <div className="w-14 shrink-0 text-sm font-semibold text-neutral-700">{formatNairobiTime(t.created_at)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-black">KES {t.amount_kes.toLocaleString()}</p>
                <p className="font-mono text-base">
                  📱***{t.phone_last3} · 🧾{t.receipt_last3 ?? "···"}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-sm font-bold ${badge.cls}`}>{badge.label}</span>
              {isPaid(t.status) ? (
                t.verified_by_conductor ? (
                  <span className="w-24 shrink-0 text-center text-sm font-bold text-green-800">✓ Verified</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void verify(t.id)}
                    className="w-24 shrink-0 rounded-lg border-2 border-ink bg-white py-2 text-base font-bold"
                  >
                    Verified
                  </button>
                )
              ) : (
                <span className="w-24 shrink-0" />
              )}
            </li>
          );
        })}
      </ul>

      {showQr ? (
        <div
          role="dialog"
          aria-label="Scan to pay"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white p-6"
          onClick={() => setShowQr(false)}
        >
          <p className="text-4xl font-black tracking-wider">{vehicleCode}</p>
          <div className="rounded-2xl border-4 border-ink bg-white p-4">
            <QRCodeSVG value={payUrl} size={300} marginSize={1} level="M" className="h-auto w-[min(80vw,420px)]" />
          </div>
          <p className="text-3xl font-black">Scan to pay fare</p>
          <p className="text-xl text-neutral-700">Changanua ulipe nauli</p>
          <p className="break-all text-center font-mono text-sm text-neutral-600">{payUrl}</p>
          <p className="text-base text-neutral-600">Tap anywhere to close</p>
        </div>
      ) : null}
    </main>
  );
}
