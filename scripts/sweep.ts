/**
 * Move sats from vehicle wallets back to the treasury (demo float recycling).
 *
 *   npx tsx scripts/sweep.ts            # all vehicles
 *   npx tsx scripts/sweep.ts KAB123B    # one vehicle
 *   npx tsx scripts/sweep.ts --dry-run  # show balances only
 *
 * Transactions stay 'settled' in the DB; only wallet balances change.
 */
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(file);
  } catch {
    // file absent
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.find((a) => !a.startsWith("--"))?.toUpperCase();

for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LNBITS_URL", "LNBITS_TREASURY_ADMIN_KEY"]) {
  if (!process.env[n]) {
    console.error(`Missing env ${n}`);
    process.exit(1);
  }
}
const env = process.env as Record<string, string>;
const LNBITS = env.LNBITS_URL.replace(/\/$/, "");

async function lnbits(path: string, key: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${LNBITS}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

const balanceSats = async (key: string) => Math.floor(Number((await lnbits("/api/v1/wallet", key)).balance) / 1000);

async function sweepOne(code: string, adminKey: string): Promise<number> {
  const sats = await balanceSats(adminKey);
  if (sats <= 0) {
    console.log(`${code}  0 sats, nothing to move`);
    return 0;
  }
  if (dryRun) {
    console.log(`${code}  ${sats} sats (dry run)`);
    return 0;
  }
  // Try the full balance; if the instance reserves a fee, leave a little behind.
  for (const amount of [sats, Math.floor(sats * 0.99) - 1]) {
    if (amount <= 0) break;
    const inv = await lnbits("/api/v1/payments", env.LNBITS_TREASURY_ADMIN_KEY, {
      out: false,
      amount,
      memo: `Nauli sweep ${code} → treasury`,
    });
    const bolt11 = String(inv.bolt11 ?? inv.payment_request ?? "");
    try {
      await lnbits("/api/v1/payments", adminKey, { out: true, bolt11 });
      console.log(`${code}  moved ${amount} sats to treasury`);
      return amount;
    } catch (e) {
      console.warn(`${code}  paying ${amount} failed: ${(e as Error).message}`);
    }
  }
  return 0;
}

async function main(): Promise<void> {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let q = db.from("vehicles").select("vehicle_code, vehicle_wallets(lnbits_admin_key)").order("vehicle_code");
  if (only) q = q.eq("vehicle_code", only);
  const { data, error } = await q.returns<{ vehicle_code: string; vehicle_wallets: { lnbits_admin_key: string } | null }[]>();
  if (error) throw error;
  if (!data?.length) throw new Error(only ? `vehicle ${only} not found` : "no vehicles");

  console.log(`treasury before: ${await balanceSats(env.LNBITS_TREASURY_ADMIN_KEY)} sats`);
  let total = 0;
  for (const v of data) {
    if (!v.vehicle_wallets) {
      console.log(`${v.vehicle_code}  no wallet`);
      continue;
    }
    total += await sweepOne(v.vehicle_code, v.vehicle_wallets.lnbits_admin_key);
  }
  console.log(`treasury after:  ${await balanceSats(env.LNBITS_TREASURY_ADMIN_KEY)} sats  (moved ${total})`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
