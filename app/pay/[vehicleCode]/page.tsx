import type { Metadata } from "next";
import { CodeEntry } from "@/components/CodeEntry";
import { Header } from "@/components/Logo";
import { cleanVehicleCode, getVehicleByCode } from "@/lib/server/vehicles";
import { PayForm } from "./PayForm";

export const dynamic = "force-dynamic";

type Props = { params: { vehicleCode: string } };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `Pay fare · ${cleanVehicleCode(params.vehicleCode)} · Nauli SaKo` };
}

export default async function PayPage({ params }: Props) {
  const vehicle = await getVehicleByCode(params.vehicleCode);

  if (!vehicle) {
    return (
      <main className="mx-auto max-w-md">
        <Header />
        <section className="space-y-4 px-4 py-6">
          <h1 className="text-2xl font-extrabold">We can&apos;t find {cleanVehicleCode(params.vehicleCode)}</h1>
          <p className="text-lg">Check the number plate on the matatu and try again.</p>
          <p className="text-base text-neutral-600">Angalia nambari ya gari ujaribu tena.</p>
          <CodeEntry />
        </section>
      </main>
    );
  }

  const conductorFirst = vehicle.conductorName?.split(/\s+/)[0] ?? null;

  return (
    <main className="mx-auto max-w-md">
      <Header />
      <section className="border-b-2 border-ink bg-matatu px-4 py-4">
        <p className="text-3xl font-black tracking-wider">{vehicle.vehicleCode}</p>
        {vehicle.routeName ? <p className="text-lg font-semibold">{vehicle.routeName}</p> : null}
        {conductorFirst ? <p className="text-base">Conductor: {conductorFirst}</p> : null}
      </section>
      <PayForm vehicleCode={vehicle.vehicleCode} presetFareKes={vehicle.presetFareKes ?? 50} />
    </main>
  );
}
