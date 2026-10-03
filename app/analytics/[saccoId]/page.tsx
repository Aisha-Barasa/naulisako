import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { HourlyBars } from "@/components/HourlyBars";
import { Header } from "@/components/Logo";
import { PinGate } from "@/components/PinGate";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { briefingEnabled } from "@/lib/server/briefing";
import { getSaccoForecast } from "@/lib/server/forecast";
import { AiBriefing } from "./AiBriefing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forecast · Nauli SaKo" };

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default async function AnalyticsPage({ params }: { params: { saccoId: string } }) {
  if (!adminSessionOk()) {
    return (
      <main>
        <Header />
        <PinGate title="Forecast" />
      </main>
    );
  }
  const id = z.string().uuid().safeParse(params.saccoId);
  if (!id.success) notFound();
  const f = await getSaccoForecast(id.data);
  if (!f) notFound();

  const todayActual = f.vehicles.reduce((s, v) => s + v.todayActualKes, 0);
  const todayProjected = f.vehicles.reduce((s, v) => s + v.todayProjectedSoFarKes, 0);
  const pace = todayProjected > 0 ? Math.round((todayActual / todayProjected) * 100) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-12">
      <Header>
        <Link href={`/sacco/${f.saccoId}`} className="text-base font-bold underline">
          {f.saccoName}
        </Link>
      </Header>

      <section className="px-4">
        <h1 className="text-2xl font-black">
          Tomorrow · {f.tomorrow.weekday} {f.tomorrow.date}
        </h1>
        <p className="text-base text-neutral-700">Projected from the average of the last 4 {f.tomorrow.weekday}s.</p>
      </section>

      <section className="mx-4 grid grid-cols-2 overflow-hidden rounded-2xl border-2 border-ink bg-matatu sm:grid-cols-4">
        {[
          { label: "Projected KES", value: `KES ${f.fleet.tomorrowKes.toLocaleString()}` },
          { label: "Projected fares", value: f.fleet.tomorrowFares.toLocaleString() },
          { label: "Peak hours", value: f.fleet.peakHours.map(hh).join(", ") || "—" },
          { label: "Best 8h shift", value: `${hh(f.fleet.shift.start)}–${hh(f.fleet.shift.end)}` },
        ].map((t) => (
          <div key={t.label} className="border-b-2 border-r-2 border-ink px-3 py-3 sm:border-b-0">
            <p className="text-xs font-bold uppercase">{t.label}</p>
            <p className="text-xl font-black">{t.value}</p>
          </div>
        ))}
      </section>

      {briefingEnabled() ? (
        <div className="px-4">
          <AiBriefing saccoId={f.saccoId} />
        </div>
      ) : null}

      <section className="px-4">
        <HourlyBars
          title={`Projected KES by hour · ${f.tomorrow.weekday}`}
          bars={{ label: "Projected", values: f.fleet.tomorrowHourly }}
          highlight={{ ...f.fleet.shift, label: "Best 8h shift" }}
        />
      </section>

      <section className="space-y-2 px-4">
        <HourlyBars
          title={`Today so far · ${f.today.weekday}`}
          bars={{ label: "Actual", values: f.fleet.todayActualHourly }}
          line={{ label: "Projected", values: f.fleet.todayProjectedHourly }}
          upToHour={f.today.currentHour}
        />
        <p className="text-base">
          Through {hh(f.today.currentHour)}: KES {todayActual.toLocaleString()} actual vs KES {todayProjected.toLocaleString()} projected
          {pace !== null ? ` (${pace}% of usual)` : ""}.
        </p>
      </section>

      <section className="mx-4 overflow-hidden rounded-2xl border-2 border-ink">
        <h2 className="border-b-2 border-ink bg-neutral-100 px-4 py-3 text-xl font-extrabold">By vehicle · tomorrow</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-base">
            <thead className="text-xs uppercase text-neutral-600">
              <tr>
                <th className="px-4 py-2">Plate</th>
                <th className="px-2 py-2">Conductor</th>
                <th className="px-2 py-2 text-right">Projected KES</th>
                <th className="px-2 py-2 text-right">Fares</th>
                <th className="px-2 py-2">Peak hours</th>
                <th className="px-4 py-2">Best shift</th>
              </tr>
            </thead>
            <tbody>
              {f.vehicles.map((v) => (
                <tr key={v.vehicleCode} className="border-t border-neutral-200">
                  <td className="px-4 py-3 font-black tracking-wider">{v.vehicleCode}</td>
                  <td className="px-2 py-3">{v.conductorName ?? "—"}</td>
                  <td className="px-2 py-3 text-right font-bold">{v.tomorrowKes.toLocaleString()}</td>
                  <td className="px-2 py-3 text-right">{v.tomorrowFares}</td>
                  <td className="px-2 py-3">{v.peakHours.map(hh).join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    {hh(v.shift.start)}–{hh(v.shift.end)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="px-4 text-sm text-neutral-600">
        Statistical projection: mean takings per weekday and hour over the last 28 days. Not a trained model; holidays and weather aren&apos;t
        accounted for.
      </p>
    </main>
  );
}
