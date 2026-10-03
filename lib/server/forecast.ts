import { getSupabaseAdmin } from "./supabase-admin";
import { paidTxs, type TxRow } from "./sacco-summary";
import { nairobiDayStartISO } from "../time";

// Statistical forecast, not a trained model: mean KES and fares per
// (weekday × hour) over the last 28 full Nairobi days. Each weekday occurs
// exactly 4 times in that window, so a cell's mean is its total / 4.

const WINDOW_DAYS = 28;
const WEEKS = WINDOW_DAYS / 7;
const SHIFT_HOURS = 8;
const EAT_OFFSET_MS = 3 * 3600_000;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Hourly = number[]; // 24 entries, index = Nairobi hour

export type VehicleForecast = {
  vehicleCode: string;
  conductorName: string | null;
  tomorrowKes: number;
  tomorrowFares: number;
  peakHours: number[];
  shift: { start: number; end: number; kes: number };
  todayActualKes: number;
  todayProjectedSoFarKes: number;
};

export type SaccoForecast = {
  saccoId: string;
  saccoName: string;
  generatedAt: string;
  tomorrow: { weekday: string; date: string };
  today: { weekday: string; currentHour: number };
  fleet: {
    tomorrowHourly: Hourly;
    tomorrowFaresHourly: Hourly;
    tomorrowKes: number;
    tomorrowFares: number;
    todayActualHourly: Hourly;
    todayProjectedHourly: Hourly;
    peakHours: number[];
    shift: { start: number; end: number; kes: number };
  };
  vehicles: VehicleForecast[];
};

const zeros = (): Hourly => Array.from({ length: 24 }, () => 0);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function nairobiParts(iso: string | Date): { dow: number; hour: number } {
  const d = new Date(new Date(iso).getTime() + EAT_OFFSET_MS);
  return { dow: d.getUTCDay(), hour: d.getUTCHours() };
}

/** Top `n` hours by value (value > 0), highest first. */
function peakHours(hourly: Hourly, n = 3): number[] {
  return hourly
    .map((v, h) => ({ v, h }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => x.h);
}

/** Contiguous window of SHIFT_HOURS within the day with the highest total. */
function bestShift(hourly: Hourly): { start: number; end: number; kes: number } {
  let best = { start: 0, end: SHIFT_HOURS, kes: -1 };
  for (let start = 0; start + SHIFT_HOURS <= 24; start++) {
    const kes = sum(hourly.slice(start, start + SHIFT_HOURS));
    if (kes > best.kes) best = { start, end: start + SHIFT_HOURS, kes };
  }
  return { ...best, kes: Math.round(best.kes) };
}

/** mean[dow][hour] of KES and fare counts from history rows. */
function weeklyMeans(rows: TxRow[]): { kes: Hourly[]; fares: Hourly[] } {
  const kes = Array.from({ length: 7 }, zeros);
  const fares = Array.from({ length: 7 }, zeros);
  for (const r of rows) {
    const { dow, hour } = nairobiParts(r.created_at);
    kes[dow][hour] += r.amount_kes / WEEKS;
    fares[dow][hour] += 1 / WEEKS;
  }
  return { kes, fares };
}

export async function getSaccoForecast(saccoId: string, now: Date = new Date()): Promise<SaccoForecast | null> {
  const db = getSupabaseAdmin();
  const { data: sacco, error: sErr } = await db.from("saccos").select("id, name").eq("id", saccoId).maybeSingle<{ id: string; name: string }>();
  if (sErr) throw sErr;
  if (!sacco) return null;

  const { data: vehicles, error: vErr } = await db
    .from("vehicles")
    .select("id, vehicle_code, conductor_name")
    .eq("sacco_id", saccoId)
    .order("vehicle_code")
    .returns<{ id: string; vehicle_code: string; conductor_name: string | null }[]>();
  if (vErr) throw vErr;
  const ids = (vehicles ?? []).map((v) => v.id);

  const todayStart = nairobiDayStartISO(now);
  const [history, today] = ids.length
    ? await Promise.all([paidTxs(ids, nairobiDayStartISO(now, WINDOW_DAYS), todayStart), paidTxs(ids, todayStart, now.toISOString())])
    : [[], []];

  const { dow: todayDow, hour: currentHour } = nairobiParts(now);
  const tomorrowDow = (todayDow + 1) % 7;
  const tomorrowDate = new Date(new Date(nairobiDayStartISO(now)).getTime() + 24 * 3600_000 + EAT_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

  const fleetTomorrow = zeros();
  const fleetTomorrowFares = zeros();
  const fleetTodayProjected = zeros();
  const fleetTodayActual = zeros();

  const perVehicle: VehicleForecast[] = (vehicles ?? []).map((v) => {
    const means = weeklyMeans(history.filter((r) => r.vehicle_id === v.id));
    const tomorrow = means.kes[tomorrowDow];
    const todayProjected = means.kes[todayDow];
    const todayActual = zeros();
    for (const r of today.filter((t) => t.vehicle_id === v.id)) todayActual[nairobiParts(r.created_at).hour] += r.amount_kes;

    tomorrow.forEach((x, h) => (fleetTomorrow[h] += x));
    means.fares[tomorrowDow].forEach((x, h) => (fleetTomorrowFares[h] += x));
    todayProjected.forEach((x, h) => (fleetTodayProjected[h] += x));
    todayActual.forEach((x, h) => (fleetTodayActual[h] += x));

    return {
      vehicleCode: v.vehicle_code,
      conductorName: v.conductor_name,
      tomorrowKes: Math.round(sum(tomorrow)),
      tomorrowFares: Math.round(sum(means.fares[tomorrowDow])),
      peakHours: peakHours(tomorrow),
      shift: bestShift(tomorrow),
      todayActualKes: sum(todayActual),
      todayProjectedSoFarKes: Math.round(sum(todayProjected.slice(0, currentHour + 1))),
    };
  });

  const round = (h: Hourly) => h.map((x) => Math.round(x));
  return {
    saccoId: sacco.id,
    saccoName: sacco.name,
    generatedAt: now.toISOString(),
    tomorrow: { weekday: WEEKDAYS[tomorrowDow], date: tomorrowDate },
    today: { weekday: WEEKDAYS[todayDow], currentHour },
    fleet: {
      tomorrowHourly: round(fleetTomorrow),
      tomorrowFaresHourly: round(fleetTomorrowFares),
      tomorrowKes: Math.round(sum(fleetTomorrow)),
      tomorrowFares: Math.round(sum(fleetTomorrowFares)),
      todayActualHourly: fleetTodayActual,
      todayProjectedHourly: round(fleetTodayProjected),
      peakHours: peakHours(fleetTomorrow),
      shift: bestShift(fleetTomorrow),
    },
    vehicles: perVehicle.sort((a, b) => b.tomorrowKes - a.tomorrowKes),
  };
}
