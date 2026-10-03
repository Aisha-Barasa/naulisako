import { getSupabaseAdmin } from "./supabase-admin";
import { createInvoice, getBalance, getPayment, payInvoice } from "./lnbits";
import { kesToSats } from "./pricing";

// Treasury settlement: once KES is received (tx 'fulfilled'), the pre-funded
// treasury wallet pays an invoice issued by the vehicle's wallet for the
// KES-equivalent sats.
//
// Never pay twice: the vehicle invoice's payment_hash is written to the tx
// (the "claim") before paying. A tx with a claim is only ever finished by
// asking LNbits whether that invoice got paid, or re-paying that same invoice.

export type SettleResult = { ok: true; amountSats: number } | { ok: false; reason: string };

type SettleTx = {
  id: string;
  status: string;
  amount_kes: number;
  mpesa_receipt: string | null;
  ln_payment_hash: string | null;
  amount_sats: number | null;
  vehicles: { vehicle_code: string; vehicle_wallets: { lnbits_invoice_key: string } | { lnbits_invoice_key: string }[] | null };
};

function treasuryAdminKey(): string {
  const key = process.env.LNBITS_TREASURY_ADMIN_KEY;
  if (!key) throw new Error("server is missing LNBITS_TREASURY_ADMIN_KEY");
  return key;
}

export async function settleTransaction(txId: string): Promise<SettleResult> {
  const db = getSupabaseAdmin();
  const { data: tx, error } = await db
    .from("transactions")
    .select(
      "id, status, amount_kes, mpesa_receipt, ln_payment_hash, amount_sats, vehicles!inner(vehicle_code, vehicle_wallets(lnbits_invoice_key))",
    )
    .eq("id", txId)
    .maybeSingle<SettleTx>();
  if (error) throw error;
  if (!tx) return { ok: false, reason: "not_found" };
  if (tx.status === "settled") return { ok: true, amountSats: tx.amount_sats ?? 0 };
  if (tx.status !== "fulfilled") return { ok: false, reason: `status_${tx.status}` };

  const setReason = async (reason: string) => {
    await db.from("transactions").update({ failure_reason: reason }).eq("id", txId);
  };
  const releaseClaim = async (hash: string) => {
    await db.from("transactions").update({ ln_payment_hash: null }).eq("id", txId).eq("ln_payment_hash", hash);
  };
  const finalize = async (sats: number): Promise<SettleResult> => {
    const { error: upErr } = await db
      .from("transactions")
      .update({ status: "settled", settled_at: new Date().toISOString(), failure_reason: null })
      .eq("id", txId)
      .eq("status", "fulfilled");
    if (upErr) throw upErr;
    return { ok: true, amountSats: sats };
  };

  const wallets = tx.vehicles.vehicle_wallets;
  const vehicleKey = Array.isArray(wallets) ? wallets[0]?.lnbits_invoice_key : wallets?.lnbits_invoice_key;
  if (!vehicleKey) {
    await setReason("vehicle_wallet_missing");
    return { ok: false, reason: "vehicle_wallet_missing" };
  }

  let bolt11: string;
  let hash: string;
  let sats: number;

  if (tx.ln_payment_hash) {
    // An earlier attempt claimed this tx. Did its payment land?
    hash = tx.ln_payment_hash;
    sats = tx.amount_sats ?? 0;
    const p = await getPayment(vehicleKey, hash);
    if (p.paid) return finalize(sats);
    if (!p.bolt11) {
      await releaseClaim(hash);
      return { ok: false, reason: "stale_claim_released" };
    }
    bolt11 = p.bolt11; // re-pay the same invoice: LNbits won't pay one hash twice
  } else {
    const priced = await kesToSats(tx.amount_kes);
    sats = priced.sats;

    const treasurySats = await getBalance(treasuryAdminKey());
    if (treasurySats < sats) {
      // KES was received; leave 'fulfilled' so settlement can be retried after a top-up.
      await setReason("treasury_low");
      return { ok: false, reason: "treasury_low" };
    }

    const memo = `Nauli ${tx.vehicles.vehicle_code} fare ${tx.mpesa_receipt ?? tx.id.slice(0, 8)}`;
    const invoice = await createInvoice(vehicleKey, sats, memo);
    bolt11 = invoice.bolt11;
    hash = invoice.paymentHash;

    const { data: claimed, error: claimErr } = await db
      .from("transactions")
      .update({ ln_payment_hash: hash, amount_sats: sats, btc_kes_rate: priced.rate })
      .eq("id", txId)
      .eq("status", "fulfilled")
      .is("ln_payment_hash", null)
      .select("id");
    if (claimErr) throw claimErr;
    if (!claimed?.length) return { ok: false, reason: "already_claimed" };
  }

  try {
    await payInvoice(treasuryAdminKey(), bolt11);
  } catch (e) {
    // The pay call can fail after the payment went through (timeout). Ask before giving up.
    const after = await getPayment(vehicleKey, hash).catch(() => null);
    if (after?.paid) return finalize(sats);
    if (after) await releaseClaim(hash); // verified unpaid: next retry starts fresh
    await setReason(`settlement_failed: ${(e as Error).message}`.slice(0, 500));
    return { ok: false, reason: "payment_failed" };
  }

  return finalize(sats);
}

