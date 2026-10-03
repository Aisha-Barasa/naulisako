import type { Metadata } from "next";
import { CodeEntry } from "@/components/CodeEntry";
import { Header } from "@/components/Logo";
import { ConductorNav } from "@/components/ConductorNav";
import { Plate } from "@/components/Plate";
import { cleanVehicleCode, getVehicleByCode } from "@/lib/server/vehicles";
import { PayForm } from "./PayForm";

export const dynamic = "force-dynamic";

type Props = { params: { vehicleCode: string }; searchParams: { from?: string } };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `Pay fare · ${cleanVehicleCode(params.vehicleCode)} · Nauli SaKo` };
}

export default async function PayPage({ params, searchParams }: Props) {
  // Passengers arrive from the QR sticker; a conductor arrives from the dashboard to prompt a passenger.
  const fromConductor = searchParams.from === "conductor";
  const vehicle = await getVehicleByCode(params.vehicleCode);

  if (!vehicle) {
    return (
      <main className="mx-auto max-w-md">
        <Header />
        <section className="space-y-4 px-4 py-6">
          <h1 className="font-display text-3xl font-extrabold uppercase leading-tight">
            We can&apos;t find {cleanVehicleCode(params.vehicleCode)}
          </h1>
          <p className="text-lg">Check the code printed under the QR sticker inside the matatu, then try again.</p>
          <p className="text-base text-stone-600">Angalia nambari iliyo chini ya stika ya QR, ujaribu tena.</p>
          <CodeEntry />
        </section>
      </main>
    );
  }

  const conductorFirst = vehicle.conductorName?.split(/\s+/)[0] ?? null;

  return (
    <main className={`mx-auto max-w-md ${fromConductor ? "pb-32" : ""}`}>
      <Header />
      <section className="flex flex-col items-start gap-3 bg-ink px-4 pb-5 pt-4 text-white">
        <Plate code={vehicle.vehicleCode} size="lg" />
        <div>
          {vehicle.routeName ? <p className="text-lg font-semibold">{vehicle.routeName}</p> : null}
          {conductorFirst ? <p className="text-base text-stone-300">Conductor {conductorFirst}</p> : null}
        </div>
      </section>
      <PayForm vehicleCode={vehicle.vehicleCode} presetFareKes={vehicle.presetFareKes ?? 50} fromConductor={fromConductor} />
      {fromConductor ? <ConductorNav active="prompt" vehicleCode={vehicle.vehicleCode} /> : null}
    </main>
  );
}
