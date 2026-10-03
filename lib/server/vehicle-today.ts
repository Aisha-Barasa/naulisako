import { getSupabaseAdmin } from "./supabase-admin";
import { getBalance } from "./lnbits";
import { nairobiDayStartISO } from "../time";
import { DASH_TX_COLUMNS, type DashTx, type VehicleToday } from "../dashboard-types";
import { isPaid } from "../tx-public";

/** Today's (Nairobi) live payments, totals and wallet balance for one vehicle. Seed rows excluded. */
export async function getVehicleToday(vehicleId: string): Promise<VehicleToday> {
  const db = getSupabaseAdmin();
  const [txRes, walletRes] = await Promise.all([
    db
      .from("transactions")
      .select(DASH_TX_COLUMNS)
      .eq("vehicle_id", vehicleId)
      .neq("source", "seed")
      .gte("created_at", nairobiDayStartISO())
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<DashTx[]>(),
    db.from("vehicle_wallets").select("lnbits_invoice_key").eq("vehicle_id", vehicleId).maybeSingle<{ lnbits_invoice_key: string }>(),
  ]);
  if (txRes.error) throw txRes.error;

  let walletSats: number | null = null;
  if (walletRes.data) {
    try {
      walletSats = await getBalance(walletRes.data.lnbits_invoice_key);
    } catch (e) {
      console.warn(`wallet balance unavailable for vehicle ${vehicleId}:`, (e as Error).message);
    }
  }

  const txs = txRes.data ?? [];
  const paid = txs.filter((t) => isPaid(t.status));
  return {
    todayKes: paid.reduce((s, t) => s + t.amount_kes, 0),
    todaySats: paid.reduce((s, t) => s + (t.status === "settled" ? t.amount_sats ?? 0 : 0), 0),
    todayCount: paid.length,
    walletSats,
    txs,
  };
}
