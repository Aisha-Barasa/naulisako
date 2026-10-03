import { NextResponse } from "next/server";
import { getVehicleByCode } from "@/lib/server/vehicles";
import { getVehicleToday } from "@/lib/server/vehicle-today";

// Dashboard resync: today's list, totals and wallet balance (balance needs a server-side key).

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { vehicleCode: string } }) {
  const vehicle = await getVehicleByCode(params.vehicleCode);
  if (!vehicle) return NextResponse.json({ error: "Unknown vehicle" }, { status: 404 });
  try {
    return NextResponse.json(await getVehicleToday(vehicle.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`today ${vehicle.vehicleCode} failed`, e);
    return NextResponse.json({ error: "Could not load today's payments" }, { status: 500 });
  }
}
