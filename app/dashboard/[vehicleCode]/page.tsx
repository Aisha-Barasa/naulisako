import type { Metadata } from "next";
import { headers } from "next/headers";
import { CodeEntry } from "@/components/CodeEntry";
import { Header } from "@/components/Logo";
import { cleanVehicleCode, getVehicleByCode } from "@/lib/server/vehicles";
import { getVehicleToday } from "@/lib/server/vehicle-today";
import { nairobiDayStartISO } from "@/lib/time";
import { Dashboard } from "./Dashboard";

export const dynamic = "force-dynamic";

type Props = { params: { vehicleCode: string } };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `Conductor · ${cleanVehicleCode(params.vehicleCode)} · Nauli SaKo` };
}

/** Public base URL for the QR: APP_URL, else whatever host the conductor opened (ngrok/Vercel). */
function baseUrl(): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes("localhost")) return process.env.APP_URL.replace(/\/$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function DashboardPage({ params }: Props) {
  const vehicle = await getVehicleByCode(params.vehicleCode);
  if (!vehicle) {
    return (
      <main className="mx-auto max-w-md">
        <Header />
        <section className="space-y-4 px-4 py-6">
          <h1 className="text-2xl font-extrabold">No vehicle {cleanVehicleCode(params.vehicleCode)}</h1>
          <p className="text-lg">Check the plate and try again.</p>
          <CodeEntry />
        </section>
      </main>
    );
  }

  const today = await getVehicleToday(vehicle.id);
  return (
    <Dashboard
      vehicleId={vehicle.id}
      vehicleCode={vehicle.vehicleCode}
      conductorName={vehicle.conductorName}
      routeName={vehicle.routeName}
      payUrl={`${baseUrl()}/pay/${vehicle.vehicleCode}`}
      dayStartISO={nairobiDayStartISO()}
      initial={today}
    />
  );
}
