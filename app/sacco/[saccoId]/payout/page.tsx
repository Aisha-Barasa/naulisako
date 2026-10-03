import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Header } from "@/components/Logo";
import { PinGate } from "@/components/PinGate";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { recentPayouts } from "@/lib/server/payout";
import { getSaccoSummary } from "@/lib/server/sacco-summary";
import { formatNairobiDateTime } from "@/lib/time";
import { PayoutForm } from "./PayoutForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cash out · Nauli SaKo" };

const STATUS: Record<string, string> = {
  paid: "text-green-800",
  pending: "text-amber-800",
  failed: "text-red-800",
};

export default async function PayoutPage({ params }: { params: { saccoId: string } }) {
  if (!adminSessionOk()) {
    return (
      <main>
        <Header />
        <PinGate title="Cash out" />
      </main>
    );
  }
  const id = z.string().uuid().safeParse(params.saccoId);
  if (!id.success) notFound();
  const [summary, payouts] = await Promise.all([getSaccoSummary(id.data, "today"), recentPayouts(id.data)]);
  if (!summary) notFound();
  const vehicles = summary.owners
    .flatMap((o) => o.vehicles)
    .map((v) => ({ vehicleCode: v.vehicleCode, walletSats: v.walletSats }))
    .sort((a, b) => a.vehicleCode.localeCompare(b.vehicleCode));

  return (
    <main className="mx-auto max-w-xl space-y-6 pb-12">
      <Header>
        <Link href={`/sacco/${summary.saccoId}`} className="text-base font-bold underline">
          {summary.saccoName}
        </Link>
      </Header>

      <section className="space-y-2 px-4">
        <h1 className="text-2xl font-black">Cash out to M-Pesa</h1>
        <p className="rounded-xl border-2 border-ink bg-neutral-50 px-4 py-3 text-base">
          Open Tando or bitcoin.co.ke, create a Lightning invoice to your M-Pesa number, paste it here.
        </p>
      </section>

      <section className="px-4">
        <PayoutForm saccoId={summary.saccoId} vehicles={vehicles} />
      </section>

      <section className="mx-4 overflow-hidden rounded-2xl border-2 border-ink">
        <h2 className="border-b-2 border-ink bg-neutral-100 px-4 py-3 text-lg font-extrabold">Recent payouts</h2>
        {payouts.length === 0 ? (
          <p className="px-4 py-4 text-base text-neutral-600">No payouts yet.</p>
        ) : (
          <ul>
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-t border-neutral-200 px-4 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {p.vehicles.vehicle_code} · {p.amount_sats.toLocaleString()} sats
                  </p>
                  <p className="truncate text-sm text-neutral-600">
                    {formatNairobiDateTime(p.created_at)} · {p.provider ?? "other"}
                    {p.error ? ` · ${p.error}` : ""}
                  </p>
                </div>
                <span className={`text-sm font-bold uppercase ${STATUS[p.status] ?? ""}`}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-4 text-sm text-neutral-600">
        Vehicle wallets are segregated per vehicle on a hosted LNbits server (custodial). Payouts pay the invoice you paste; Nauli SaKo
        doesn&apos;t hold M-Pesa funds.
      </p>
    </main>
  );
}
