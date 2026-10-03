import { getSupabaseAdmin } from "./supabase-admin";
import { decodeInvoice, getBalance, getPayment, LnbitsError, payInvoice } from "./lnbits";
import { isLightningAddress, LnurlError, resolveLightningAddress } from "./lnurl";

// Off-ramp: the vehicle wallet PAYS an invoice from Tando / bitcoin.co.ke (or any
// Lightning address). Not LNURL-withdraw. Two steps: preview (decode/resolve,
// show amount) then pay (re-decode, check balance, pay, record in `payouts`).

export type Provider = "tando" | "bitcoin.co.ke" | "other";

export class PayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutError";
  }
}

type VehicleWallet = { id: string; vehicle_code: string; vehicle_wallets: { lnbits_invoice_key: string; lnbits_admin_key: string } | null };

const BOLT11 = /^ln(bc|tb|bcrt|tbs)[0-9a-z]+$/i;

export function cleanDestination(raw: string): string {
  return raw.trim().replace(/^lightning:/i, "");
}

async function loadVehicle(saccoId: string, vehicleCode: string): Promise<{ id: string; code: string; invoiceKey: string; adminKey: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("vehicles")
    .select("id, vehicle_code, vehicle_wallets(lnbits_invoice_key, lnbits_admin_key)")
    .eq("sacco_id", saccoId)
    .eq("vehicle_code", vehicleCode)
    .maybeSingle<VehicleWallet>();
  if (error) throw error;
  if (!data?.vehicle_wallets) throw new PayoutError(`Vehicle ${vehicleCode} or its wallet not found`);
  return {
    id: data.id,
    code: data.vehicle_code,
    invoiceKey: data.vehicle_wallets.lnbits_invoice_key,
    adminKey: data.vehicle_wallets.lnbits_admin_key,
  };
}

export type PayoutPreview = {
  kind: "bolt11" | "lightning_address";
  bolt11: string;
  amountSats: number;
  description: string | null;
  balanceSats: number;
};

export async function previewPayout(input: {
  saccoId: string;
  vehicleCode: string;
  destination: string;
  amountSats?: number;
}): Promise<PayoutPreview> {
  const v = await loadVehicle(input.saccoId, input.vehicleCode);
  const dest = cleanDestination(input.destination);

  let kind: PayoutPreview["kind"];
  let bolt11: string;
  try {
    if (BOLT11.test(dest)) {
      kind = "bolt11";
      bolt11 = dest.toLowerCase();
    } else if (isLightningAddress(dest)) {
      if (!input.amountSats || input.amountSats < 1) throw new PayoutError("Enter an amount in sats for a Lightning address");
      kind = "lightning_address";
      bolt11 = (await resolveLightningAddress(dest, input.amountSats)).bolt11;
    } else {
      throw new PayoutError("Paste a Lightning invoice (starts with lnbc…) or a Lightning address (name@domain)");
    }

    const decoded = await decodeInvoice(v.invoiceKey, bolt11);
    if (!decoded.amountSats) throw new PayoutError("This invoice has no amount. Create one with an amount in Tando / bitcoin.co.ke.");
    // LNURL-pay rule: the returned invoice must be for exactly the amount we asked for.
    if (kind === "lightning_address" && decoded.amountSats !== input.amountSats) {
      throw new PayoutError("The Lightning address returned an invoice for a different amount; not paying it");
    }
    const balanceSats = await getBalance(v.invoiceKey);
    return { kind, bolt11, amountSats: decoded.amountSats, description: decoded.description, balanceSats };
  } catch (e) {
    if (e instanceof PayoutError) throw e;
    if (e instanceof LnurlError) throw new PayoutError(e.message);
    if (e instanceof LnbitsError) throw new PayoutError(e.status === 400 ? "That invoice couldn't be read. Check it's complete." : e.message);
    throw e;
  }
}

export type PayoutResult = { payoutId: string; status: "paid" | "pending"; amountSats: number; paymentHash: string };

export async function executePayout(input: {
  saccoId: string;
  vehicleCode: string;
  bolt11: string;
  destination: string;
  provider: Provider;
}): Promise<PayoutResult> {
  const v = await loadVehicle(input.saccoId, input.vehicleCode);
  const bolt11 = cleanDestination(input.bolt11).toLowerCase();
  if (!BOLT11.test(bolt11)) throw new PayoutError("Invalid invoice");

  // Re-check at pay time: amount from the invoice itself, balance right now.
  const decoded = await decodeInvoice(v.invoiceKey, bolt11).catch(() => {
    throw new PayoutError("That invoice couldn't be read");
  });
  if (!decoded.amountSats) throw new PayoutError("Invoice has no amount");
  const balance = await getBalance(v.invoiceKey);
  if (balance < decoded.amountSats) {
    throw new PayoutError(`Wallet has ${balance.toLocaleString()} sats; invoice needs ${decoded.amountSats.toLocaleString()}`);
  }

  const db = getSupabaseAdmin();
  // Refuse an invoice we've already paid (or are paying). Without this, a retry's
  // "did it get paid?" check would see the first payment and record a second payout.
  const { data: dup, error: dupErr } = await db
    .from("payouts")
    .select("status")
    .eq("ln_payment_hash", decoded.paymentHash)
    .in("status", ["paid", "pending"])
    .limit(1);
  if (dupErr) throw dupErr;
  if (dup?.length) throw new PayoutError(dup[0].status === "paid" ? "This invoice was already paid" : "This invoice is already being paid");
  if ((await getPayment(v.adminKey, decoded.paymentHash).catch(() => null))?.paid) {
    throw new PayoutError("This invoice was already paid");
  }

  const { data: row, error: insErr } = await db
    .from("payouts")
    .insert({
      vehicle_id: v.id,
      destination: cleanDestination(input.destination).slice(0, 2000),
      provider: input.provider,
      amount_sats: decoded.amountSats,
      ln_payment_hash: decoded.paymentHash,
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr) throw insErr;

  try {
    await payInvoice(v.adminKey, bolt11);
  } catch (e) {
    // The call can fail after the payment left (timeout): ask before marking failed.
    const after = await getPayment(v.adminKey, decoded.paymentHash).catch(() => null);
    if (!after?.paid) {
      const msg = e instanceof LnbitsError ? e.message : "Payment failed";
      await db.from("payouts").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", row.id);
      throw new PayoutError(msg.includes("Insufficient") ? "Not enough sats to cover the amount plus routing fees" : msg);
    }
  }

  const final = await getPayment(v.adminKey, decoded.paymentHash).catch(() => null);
  const status = final?.paid ? "paid" : "pending";
  await db.from("payouts").update({ status }).eq("id", row.id);
  return { payoutId: row.id, status, amountSats: decoded.amountSats, paymentHash: decoded.paymentHash };
}

export type PayoutRow = {
  id: string;
  created_at: string;
  provider: string | null;
  amount_sats: number;
  status: "pending" | "paid" | "failed";
  error: string | null;
  vehicles: { vehicle_code: string };
};

/**
 * Lightning payouts can stay in flight for a while. Ask LNbits about every pending
 * payout in this SACCO and record the outcome, so the page never shows a stale "pending".
 */
export async function refreshPendingPayouts(saccoId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("payouts")
    .select("id, ln_payment_hash, vehicles!inner(sacco_id, vehicle_wallets(lnbits_admin_key))")
    .eq("status", "pending")
    .eq("vehicles.sacco_id", saccoId)
    .not("ln_payment_hash", "is", null)
    .returns<{ id: string; ln_payment_hash: string; vehicles: { vehicle_wallets: { lnbits_admin_key: string } | null } }[]>();
  if (error || !data?.length) return;
  await Promise.all(
    data.map(async (p) => {
      const key = p.vehicles.vehicle_wallets?.lnbits_admin_key;
      if (!key) return;
      const result = await getPayment(key, p.ln_payment_hash).catch(() => null);
      if (!result || (!result.paid && !result.failed)) return; // still in flight, or LNbits unreachable
      await db
        .from("payouts")
        .update(result.paid ? { status: "paid", error: null } : { status: "failed", error: "Lightning payment failed; sats returned to the wallet" })
        .eq("id", p.id)
        .eq("status", "pending");
    }),
  );
}

export async function recentPayouts(saccoId: string, limit = 10): Promise<PayoutRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("payouts")
    .select("id, created_at, provider, amount_sats, status, error, vehicles!inner(vehicle_code, sacco_id)")
    .eq("vehicles.sacco_id", saccoId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<PayoutRow[]>();
  if (error) throw error;
  return data ?? [];
}
