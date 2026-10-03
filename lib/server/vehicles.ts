import { getSupabaseAdmin } from "./supabase-admin";

export type PublicVehicle = {
  id: string;
  vehicleCode: string;
  routeName: string | null;
  conductorName: string | null;
  presetFareKes: number | null;
};

export function cleanVehicleCode(raw: string): string {
  return decodeURIComponent(raw).replace(/\s+/g, "").toUpperCase();
}

/** Non-secret vehicle fields only (never wallet keys). */
export async function getVehicleByCode(raw: string): Promise<PublicVehicle | null> {
  const code = cleanVehicleCode(raw);
  if (!/^[A-Z0-9]{3,12}$/.test(code)) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("vehicles")
    .select("id, vehicle_code, route_name, conductor_name, preset_fare_kes")
    .eq("vehicle_code", code)
    .maybeSingle<{
      id: string;
      vehicle_code: string;
      route_name: string | null;
      conductor_name: string | null;
      preset_fare_kes: number | null;
    }>();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    vehicleCode: data.vehicle_code,
    routeName: data.route_name,
    conductorName: data.conductor_name,
    presetFareKes: data.preset_fare_kes,
  };
}
