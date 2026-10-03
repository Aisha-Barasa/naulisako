/**
 * End-to-end smoke test: /api/pay → simulate-callback → settled + vehicle wallet credited.
 *
 *   npx tsx scripts/smoke.ts KAB123B 50 0708374149
 *   SMOKE_BASE_URL=https://your-app.vercel.app npx tsx scripts/smoke.ts KAB123B 50 0708374149
 *
 * Sends a real sandbox STK push; Daraja's own (failed/timeout) callback arrives
 * later and is ignored because the simulated success got there first.
 */
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(file);
  } catch {
    // file absent
  }
}

const [vehicleCode = "KAB123B", amountArg = "50", phone = "0708374149"] = process.argv.slice(2);
const amountKes = Number(amountArg);
const base = (process.env.SMOKE_BASE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

function die(msg: string): never {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function walletSats(lnbitsUrl: string, key: string): Promise<number> {
  const res = await fetch(`${lnbitsUrl.replace(/\/$/, "")}/api/v1/wallet`, { headers: { "X-Api-Key": key } });
  if (!res.ok) die(`LNbits wallet read failed (${res.status})`);
  const json = (await res.json()) as { balance: number };
  return Math.floor(json.balance / 1000);
}

async function main(): Promise<void> {
  for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LNBITS_URL", "LNBITS_TREASURY_ADMIN_KEY"]) {
    if (!process.env[n]) die(`missing env ${n}`);
  }
  const env = process.env as Record<string, string>;
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`smoke  ${base}  ${vehicleCode}  KES ${amountKes}  ${phone.slice(0, 4)}****${phone.slice(-3)}`);

  const { data: v, error: vErr } = await db
    .from("vehicles")
    .select("id, vehicle_wallets(lnbits_invoice_key)")
    .eq("vehicle_code", vehicleCode)
    .maybeSingle<{ id: string; vehicle_wallets: { lnbits_invoice_key: string } | null }>();
  if (vErr || !v?.vehicle_wallets) die(`vehicle ${vehicleCode} or its wallet not found`);
  const vehicleKey = v.vehicle_wallets.lnbits_invoice_key;

  const vehicleBefore = await walletSats(env.LNBITS_URL, vehicleKey);
  const treasuryBefore = await walletSats(env.LNBITS_URL, env.LNBITS_TREASURY_ADMIN_KEY);
  console.log(`1. balances before  vehicle=${vehicleBefore} sats  treasury=${treasuryBefore} sats`);

  const pay = await postJson("/api/pay", { vehicleCode, amountKes, phone });
  if (pay.status !== 200) die(`/api/pay ${pay.status}: ${JSON.stringify(pay.json)}`);
  const txId = String(pay.json.txId);
  console.log(`2. /api/pay ok  txId=${txId}  checkout=${String(pay.json.checkoutRequestId)}`);

  const sim = await postJson("/api/dev/simulate-callback", { txId, pin: process.env.DEMO_ADMIN_PIN });
  if (sim.status !== 200) die(`simulate-callback ${sim.status}: ${JSON.stringify(sim.json)}`);
  console.log(`3. simulated callback  receipt=${String(sim.json.receipt)}  status=${String(sim.json.status)}`);

  const { data: tx } = await db
    .from("transactions")
    .select("status, amount_sats, btc_kes_rate, ln_payment_hash, failure_reason")
    .eq("id", txId)
    .single<{ status: string; amount_sats: number | null; btc_kes_rate: number | null; ln_payment_hash: string | null; failure_reason: string | null }>();
  if (!tx) die("tx row vanished");
  if (tx.status !== "settled") die(`tx is '${tx.status}', not settled. failure_reason=${tx.failure_reason ?? "none"}`);
  console.log(`4. tx settled  ${tx.amount_sats} sats @ KES ${Math.round(Number(tx.btc_kes_rate)).toLocaleString()}/BTC  hash=${tx.ln_payment_hash?.slice(0, 16)}…`);

  const vehicleAfter = await walletSats(env.LNBITS_URL, vehicleKey);
  const treasuryAfter = await walletSats(env.LNBITS_URL, env.LNBITS_TREASURY_ADMIN_KEY);
  const gained = vehicleAfter - vehicleBefore;
  console.log(`5. balances after   vehicle=${vehicleAfter} (+${gained})  treasury=${treasuryAfter} (${treasuryAfter - treasuryBefore})`);
  if (gained < (tx.amount_sats ?? 1)) die(`vehicle wallet gained ${gained}, expected ${tx.amount_sats}`);

  console.log("PASS");
}

main().catch((e: unknown) => die((e as Error).message));
