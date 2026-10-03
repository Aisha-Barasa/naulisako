import { getSupabaseAdmin } from "./supabase-admin";
import { getBalance } from "./lnbits";
import { nairobiDayStartISO } from "../time";

export type SummaryRange = "today" | "yesterday" | "7d";

export type VehicleSummary = {
  vehicleCode: string;
  conductorName: string | null;
  kes: number;
  sats: number;
  count: number;
  /** % of paid fares the conductor marked verified; null when there were none. */
  verifiedPct: number | null;
  walletSats: number | null;
  lastPaymentAt: string | null;
};

export type SaccoSummary = {
  saccoId: string;
  saccoName: string;
  range: SummaryRange;
  from: string;
  to: string;
  owners: { ownerName: string; vehicles: VehicleSummary[] }[];
  totals: { kes: number; sats: number; count: number; walletSats: number };
};

export function rangeBounds(range: SummaryRange, now: Date = new Date()): { from: string; to: string } {
  if (range === "yesterday") return { from: nairobiDayStartISO(now, 1), to: nairobiDayStartISO(now) };
  if (range === "7d") return { from: nairobiDayStartISO(now, 6), to: now.toISOString() };
  return { from: nairobiDayStartISO(now), to: now.toISOString() };
}

type VehicleRow = {
  id: string;
  vehicle_code: string;
  conductor_name: string | null;
  owner_id: string | null;
  vehicle_wallets: { lnbits_invoice_key: string } | null;
};
type TxRow = {
  id: string;
  vehicle_id: string;
  amount_kes: number;
  amount_sats: number | null;
  status: "fulfilled" | "settled";
  verified_by_conductor: boolean;
  created_at: string;
};

const PAGE = 1000; // PostgREST caps rows per request

/** Paid fares (fulfilled + settled, seed history included) in [from, to). */
async function paidTxs(vehicleIds: string[], from: string, to: string): Promise<TxRow[]> {
  const db = getSupabaseAdmin();
  const out: TxRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("transactions")
      .select("id, vehicle_id, amount_kes, amount_sats, status, verified_by_conductor, created_at")
      .in("vehicle_id", vehicleIds)
      .in("status", ["fulfilled", "settled"])
      .gte("created_at", from)
      .lt("created_at", to)
      .order("id")
      .range(offset, offset + PAGE - 1)
      .returns<TxRow[]>();
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function getSaccoSummary(saccoId: string, range: SummaryRange): Promise<SaccoSummary | null> {
  const db = getSupabaseAdmin();
  const { data: sacco, error: sErr } = await db.from("saccos").select("id, name").eq("id", saccoId).maybeSingle<{ id: string; name: string }>();
  if (sErr) throw sErr;
  if (!sacco) return null;

  const [ownersRes, vehiclesRes] = await Promise.all([
    db.from("vehicle_owners").select("id, owner_name").eq("sacco_id", saccoId).returns<{ id: string; owner_name: string }[]>(),
    db
      .from("vehicles")
      .select("id, vehicle_code, conductor_name, owner_id, vehicle_wallets(lnbits_invoice_key)")
      .eq("sacco_id", saccoId)
      .returns<VehicleRow[]>(),
  ]);
  if (ownersRes.error) throw ownersRes.error;
  if (vehiclesRes.error) throw vehiclesRes.error;
  const vehicles = vehiclesRes.data ?? [];

  const { from, to } = rangeBounds(range);
  const [txs, balances] = await Promise.all([
    vehicles.length ? paidTxs(vehicles.map((v) => v.id), from, to) : Promise.resolve([]),
    Promise.all(
      vehicles.map(async (v) => {
        if (!v.vehicle_wallets) return null;
        try {
          return await getBalance(v.vehicle_wallets.lnbits_invoice_key);
        } catch {
          return null; // LNbits unreachable: show "—" rather than fail the page
        }
      }),
    ),
  ]);

  const byVehicle = new Map<string, TxRow[]>();
  for (const t of txs) byVehicle.set(t.vehicle_id, [...(byVehicle.get(t.vehicle_id) ?? []), t]);

  const knownOwners = new Set((ownersRes.data ?? []).map((o) => o.id));
  const rowsByOwner = new Map<string | null, VehicleSummary[]>();
  vehicles.forEach((v, i) => {
    const rows = byVehicle.get(v.id) ?? [];
    const verified = rows.filter((r) => r.verified_by_conductor).length;
    const ownerKey = v.owner_id && knownOwners.has(v.owner_id) ? v.owner_id : null;
    const summary: VehicleSummary = {
      vehicleCode: v.vehicle_code,
      conductorName: v.conductor_name,
      kes: rows.reduce((s, r) => s + r.amount_kes, 0),
      sats: rows.reduce((s, r) => s + (r.status === "settled" ? r.amount_sats ?? 0 : 0), 0),
      count: rows.length,
      verifiedPct: rows.length ? Math.round((verified / rows.length) * 100) : null,
      walletSats: balances[i],
      lastPaymentAt: rows.reduce<string | null>((m, r) => (m === null || r.created_at > m ? r.created_at : m), null),
    };
    rowsByOwner.set(ownerKey, [...(rowsByOwner.get(ownerKey) ?? []), summary]);
  });

  const sortByKes = (a: VehicleSummary, b: VehicleSummary) => b.kes - a.kes;
  const owners = (ownersRes.data ?? []).map((o) => ({
    ownerName: o.owner_name,
    vehicles: (rowsByOwner.get(o.id) ?? []).sort(sortByKes),
  }));
  const ownerless = rowsByOwner.get(null);
  if (ownerless?.length) owners.push({ ownerName: "No owner set", vehicles: ownerless.sort(sortByKes) });
  const all = owners.flatMap((o) => o.vehicles);

  return {
    saccoId: sacco.id,
    saccoName: sacco.name,
    range,
    from,
    to,
    owners,
    totals: {
      kes: all.reduce((s, v) => s + v.kes, 0),
      sats: all.reduce((s, v) => s + v.sats, 0),
      count: all.reduce((s, v) => s + v.count, 0),
      walletSats: all.reduce((s, v) => s + (v.walletSats ?? 0), 0),
    },
  };
}
