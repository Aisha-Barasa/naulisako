import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Header } from "@/components/Logo";
import { Plate } from "@/components/Plate";
import { PinGate } from "@/components/PinGate";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { getSaccoSummary, type SummaryRange } from "@/lib/server/sacco-summary";
import { formatNairobiDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SACCO · Nauli SaKo" };

const RANGES: { key: SummaryRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
];

type Props = { params: { saccoId: string }; searchParams: { range?: string } };

export default async function SaccoPage({ params, searchParams }: Props) {
  if (!adminSessionOk()) {
    return (
      <main>
        <Header />
        <PinGate title="SACCO view" />
      </main>
    );
  }

  const id = z.string().uuid().safeParse(params.saccoId);
  if (!id.success) notFound();
  const range = z.enum(["today", "yesterday", "7d"]).catch("today").parse(searchParams.range);
  const s = await getSaccoSummary(id.data, range);
  if (!s) notFound();
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? "Today";

  return (
    <main className="mx-auto max-w-4xl pb-12">
      <Header>
        <span className="text-base font-bold">{s.saccoName}</span>
      </Header>

      <nav className="flex flex-wrap gap-2 px-4 pt-4" aria-label="Date range and tools">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/sacco/${s.saccoId}?range=${r.key}`}
            aria-current={r.key === range ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-base font-bold transition-colors duration-150 ${r.key === range ? "bg-ink text-white" : "bg-white hover:bg-stone-100"}`}
          >
            {r.label}
          </Link>
        ))}
        <span className="ml-auto flex gap-2">
          <Link href={`/analytics/${s.saccoId}`} className="btn btn-primary min-h-11 rounded-full px-4 text-base">
            Forecast
          </Link>
          <Link href={`/sacco/${s.saccoId}/payout`} className="btn btn-primary min-h-11 rounded-full px-4 text-base">
            Cash out
          </Link>
        </span>
      </nav>

      <section className="mx-4 mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border-2 border-ink bg-matatu sm:grid-cols-4">
        {[
          { label: `${rangeLabel} KES`, value: `KES ${s.totals.kes.toLocaleString()}` },
          { label: "Fares", value: s.totals.count.toLocaleString() },
          { label: "Settled sats", value: s.totals.sats.toLocaleString() },
          { label: "Wallets now", value: `${s.totals.walletSats.toLocaleString()} sats` },
        ].map((t) => (
          <div key={t.label} className="border-b-2 border-r-2 border-ink px-3 py-3 sm:border-b-0">
            <p className="text-xs font-bold uppercase tracking-wider">{t.label}</p>
            <p className="num font-display text-3xl font-extrabold leading-tight">{t.value}</p>
          </div>
        ))}
      </section>

      <div className="mt-6 space-y-6 px-4">
        {s.owners.map((o) => {
          const ownerKes = o.vehicles.reduce((sum, v) => sum + v.kes, 0);
          return (
            <section key={o.ownerName} className="overflow-hidden rounded-2xl border-2 border-ink">
              <header className="flex items-baseline justify-between gap-3 border-b-2 border-ink bg-stone-100 px-4 py-3">
                <h2 className="font-display text-2xl font-extrabold uppercase">{o.ownerName}</h2>
                <p className="num text-base font-bold">
                  KES {ownerKes.toLocaleString()} · {o.vehicles.length} vehicle{o.vehicles.length === 1 ? "" : "s"}
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="num w-full min-w-[640px] text-left text-base">
                  <thead className="text-xs uppercase text-stone-600">
                    <tr>
                      <th className="px-4 py-2">Plate</th>
                      <th className="px-2 py-2">Conductor</th>
                      <th className="px-2 py-2 text-right">KES</th>
                      <th className="px-2 py-2 text-right">Fares</th>
                      <th className="px-2 py-2 text-right">Sats</th>
                      <th className="px-2 py-2 text-right">Verified</th>
                      <th className="px-2 py-2 text-right">Wallet</th>
                      <th className="px-4 py-2 text-right">Last paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.vehicles.map((v) => (
                      <tr key={v.vehicleCode} className="border-t border-stone-200">
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/${v.vehicleCode}`}
                            className="inline-block rounded-md transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-95"
                          >
                            <Plate code={v.vehicleCode} size="sm" />
                          </Link>
                        </td>
                        <td className="px-2 py-3">{v.conductorName ?? "—"}</td>
                        <td className="px-2 py-3 text-right font-bold">{v.kes.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right">{v.count.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right">{v.sats.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right">{v.verifiedPct === null ? "—" : `${v.verifiedPct}%`}</td>
                        <td className="px-2 py-3 text-right">{v.walletSats === null ? "—" : v.walletSats.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm">{v.lastPaymentAt ? formatNairobiDateTime(v.lastPaymentAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <p className="px-4 pt-6 text-sm text-stone-600">
        Totals count paid fares (M-Pesa confirmed). Sats count fares already settled to vehicle wallets. Wallet balances are live, so they
        drop after a cash-out.
      </p>
    </main>
  );
}
