/**
 * Seed: 1 SACCO, 2 owners, 3 vehicles (+ LNbits wallets), 30 days of fare history.
 * Idempotent: vehicles whose vehicle_code already exists are skipped entirely.
 *
 *   npx tsx scripts/seed.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Node 22 can read env files itself — no dotenv needed. Same precedence as Next:
// .env.local first; .env only fills what's still unset.
for (const file of [".env.local", ".env"]) {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(file);
  } catch {
    // file absent; the missing-vars check below reports what matters
  }
}

const SACCO_NAME = "Nauli Sacco Demo";

type OwnerSeed = { key: string; ownerName: string; phoneMasked: string };
type VehicleSeed = {
  vehicleCode: string;
  ownerKey: string;
  routeName: string;
  conductorName: string;
  presetFareKes: number;
};
type WalletKeys = { id: string; inkey: string; adminkey: string };

const OWNERS: OwnerSeed[] = [
  { key: "wanjiru", ownerName: "Grace Wanjiru", phoneMasked: "2547****321" },
  { key: "otieno", ownerName: "Peter Otieno", phoneMasked: "2547****654" },
];

const VEHICLES: VehicleSeed[] = [
  { vehicleCode: "KAB123B", ownerKey: "wanjiru", routeName: "CBD – Rongai (125)", conductorName: "Brian Kamau", presetFareKes: 50 },
  { vehicleCode: "KCD456C", ownerKey: "wanjiru", routeName: "CBD – Kitengela (110)", conductorName: "Kevin Mutua", presetFareKes: 80 },
  { vehicleCode: "KDE789D", ownerKey: "otieno", routeName: "CBD – Thika (237)", conductorName: "Dennis Ochieng", presetFareKes: 100 },
];

const HISTORY_DAYS = 30;
const NAIROBI_UTC_OFFSET_H = 3; // EAT, no DST

// ---------- env ----------

function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error("Missing env vars (.env.local or .env):\n  " + missing.join("\n  "));
    process.exit(1);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n] as string]));
}

// ---------- deterministic randomness ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function poisson(lambda: number, rnd: () => number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > l);
  return k - 1;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALNUM = UPPER + "0123456789";
function randomFrom(chars: string, n: number, rnd: () => number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(rnd() * chars.length)];
  return out;
}

// ---------- demand shape ----------

/** Expected fares in a given Nairobi hour. dow: 0=Sun … 6=Sat. */
function expectedFares(dow: number, hour: number): number {
  if (hour < 5 || hour > 22) return 0;
  const weekend = dow === 0 || dow === 6;

  let base: number;
  if (hour >= 6 && hour <= 8) base = 9; // morning peak 6–9am
  else if (hour >= 17 && hour <= 19) base = 8; // evening peak 5–8pm
  else if (hour === 5 || hour === 9 || hour === 16 || hour === 20) base = 4;
  else if (hour >= 10 && hour <= 15) base = 2.5;
  else base = 1.5; // 21–22

  if (weekend) {
    // flatter and quieter: peaks mostly vanish, midday a little busier
    base = hour >= 10 && hour <= 18 ? 3.5 : base * 0.4;
    if (dow === 0) base *= 0.8;
  }
  if (dow === 5 && hour >= 17 && hour <= 22) base *= 1.4; // Friday evening bump
  return base;
}

// ---------- LNbits ----------

// Creating a wallet is account-level. LNbits 1.x refuses a wallet admin key
// (401 "Missing user ID or access token"), so prefer an account access token,
// then the account user ID; the admin key only works on older versions.
async function createLnbitsWallet(lnbitsUrl: string, name: string): Promise<WalletKeys> {
  const token = process.env.LNBITS_ACCESS_TOKEN;
  const userId = process.env.LNBITS_USER_ID;
  const adminKey = process.env.LNBITS_TREASURY_ADMIN_KEY;

  let path = "/api/v1/wallet";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (userId) path += `?usr=${encodeURIComponent(userId)}`;
  else if (adminKey) headers["X-Api-Key"] = adminKey;

  const res = await fetch(`${lnbitsUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LNbits ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as Partial<WalletKeys>;
  if (!json.id || !json.inkey || !json.adminkey) {
    throw new Error(`LNbits response missing id/inkey/adminkey: ${text.slice(0, 200)}`);
  }
  return { id: json.id, inkey: json.inkey, adminkey: json.adminkey };
}

function walletsFromEnv(): Record<string, WalletKeys> | null {
  const raw = process.env.SEED_WALLETS_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, WalletKeys>;
  } catch {
    console.error("SEED_WALLETS_JSON is not valid JSON");
    process.exit(1);
  }
}

function printManualWalletInstructions(lnbitsUrl: string): void {
  console.error(`
Could not create LNbits wallets via the API.
Either set LNBITS_ACCESS_TOKEN (an account access token allowed to create wallets)
or LNBITS_USER_ID (your LNbits account's user ID, not a wallet ID) and re-run,
or create them by hand instead:
  1. Open ${lnbitsUrl} and add 3 wallets: "Nauli KAB123B", "Nauli KCD456C", "Nauli KDE789D".
  2. For each, open "API info" and copy Wallet ID, Invoice/read key, Admin key.
  3. Put them in .env.local on ONE line:
     SEED_WALLETS_JSON={"KAB123B":{"id":"...","inkey":"...","adminkey":"..."},"KCD456C":{...},"KDE789D":{...}}
  4. Re-run: npx tsx scripts/seed.ts
`);
}

// ---------- DB helpers ----------

async function getOrCreateSacco(db: SupabaseClient): Promise<string> {
  const { data: existing, error } = await db.from("saccos").select("id").eq("name", SACCO_NAME).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;
  const { data, error: insErr } = await db.from("saccos").insert({ name: SACCO_NAME }).select("id").single();
  if (insErr) throw insErr;
  return data.id as string;
}

async function getOrCreateOwner(db: SupabaseClient, saccoId: string, owner: OwnerSeed): Promise<string> {
  const { data: existing, error } = await db
    .from("vehicle_owners")
    .select("id")
    .eq("sacco_id", saccoId)
    .eq("owner_name", owner.ownerName)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;
  const { data, error: insErr } = await db
    .from("vehicle_owners")
    .insert({ sacco_id: saccoId, owner_name: owner.ownerName, phone_masked: owner.phoneMasked })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return data.id as string;
}

type SeedTx = {
  vehicle_id: string;
  amount_kes: number;
  payer_phone_masked: string;
  phone_last3: string;
  mpesa_receipt: string;
  status: "settled";
  amount_sats: number;
  btc_kes_rate: number;
  verified_by_conductor: boolean;
  source: "seed";
  created_at: string;
  completed_at: string;
  settled_at: string;
};

function buildHistory(vehicleId: string, v: VehicleSeed, btcKes: number, satsPerKes: number | null): SeedTx[] {
  const rnd = mulberry32(hashString(v.vehicleCode));
  const rows: SeedTx[] = [];
  const now = new Date();
  // "Today" in Nairobi, as a UTC-midnight date we can step back from.
  const nairobiNow = new Date(now.getTime() + NAIROBI_UTC_OFFSET_H * 3600_000);
  const todayY = nairobiNow.getUTCFullYear();
  const todayM = nairobiNow.getUTCMonth();
  const todayD = nairobiNow.getUTCDate();

  for (let back = HISTORY_DAYS; back >= 1; back--) {
    const day = new Date(Date.UTC(todayY, todayM, todayD - back));
    const dow = day.getUTCDay();
    for (let hour = 0; hour < 24; hour++) {
      const n = poisson(expectedFares(dow, hour), rnd);
      for (let i = 0; i < n; i++) {
        const minute = Math.floor(rnd() * 60);
        const second = Math.floor(rnd() * 60);
        const created = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - NAIROBI_UTC_OFFSET_H, minute, second),
        );
        const isPeak = (hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 19);
        const amountKes = isPeak && dow >= 1 && dow <= 5 && rnd() < 0.5 ? v.presetFareKes + 20 : v.presetFareKes;
        const last3 = String(Math.floor(rnd() * 1000)).padStart(3, "0");
        const receipt = "S" + randomFrom(UPPER, 1, rnd) + randomFrom(ALNUM, 8, rnd);
        const sats = satsPerKes ? Math.round(amountKes * satsPerKes) : Math.max(1, Math.round((amountKes / btcKes) * 1e8));
        const completed = new Date(created.getTime() + (15 + Math.floor(rnd() * 30)) * 1000);
        const settled = new Date(completed.getTime() + (1 + Math.floor(rnd() * 4)) * 1000);
        rows.push({
          vehicle_id: vehicleId,
          amount_kes: amountKes,
          payer_phone_masked: `2547****${last3}`,
          phone_last3: last3,
          mpesa_receipt: receipt,
          status: "settled",
          amount_sats: sats,
          btc_kes_rate: btcKes,
          verified_by_conductor: rnd() < 0.85,
          source: "seed",
          created_at: created.toISOString(),
          completed_at: completed.toISOString(),
          settled_at: settled.toISOString(),
        });
      }
    }
  }
  return rows;
}

async function insertInBatches(db: SupabaseClient, rows: SeedTx[], batchSize = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await db.from("transactions").insert(rows.slice(i, i + batchSize));
    if (error) throw error;
  }
}

// ---------- main ----------

async function main(): Promise<void> {
  const env = requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LNBITS_URL"]);
  const manualWallets = walletsFromEnv();
  const canCreateWallets = ["LNBITS_ACCESS_TOKEN", "LNBITS_USER_ID", "LNBITS_TREASURY_ADMIN_KEY"].some((n) => process.env[n]);
  if (!manualWallets && !canCreateWallets) {
    console.error("Set LNBITS_ACCESS_TOKEN (preferred) or LNBITS_USER_ID, or SEED_WALLETS_JSON, to get vehicle wallets.");
    process.exit(1);
  }

  const btcKes = Number(process.env.BTC_KES_FALLBACK || 13_000_000);
  const satsPerKes = process.env.DEMO_SATS_PER_KES ? Number(process.env.DEMO_SATS_PER_KES) : null;

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const saccoId = await getOrCreateSacco(db);
  console.log(`SACCO  ${SACCO_NAME}  ${saccoId}`);

  const ownerIds: Record<string, string> = {};
  for (const o of OWNERS) {
    ownerIds[o.key] = await getOrCreateOwner(db, saccoId, o);
    console.log(`OWNER  ${o.ownerName}  ${ownerIds[o.key]}`);
  }

  const { data: existingRows, error: exErr } = await db
    .from("vehicles")
    .select("id, vehicle_code")
    .in("vehicle_code", VEHICLES.map((v) => v.vehicleCode));
  if (exErr) throw exErr;
  const existing = new Set((existingRows ?? []).map((r) => r.vehicle_code as string));

  for (const v of VEHICLES) {
    if (existing.has(v.vehicleCode)) {
      console.log(`SKIP   ${v.vehicleCode} already exists`);
      continue;
    }

    // Get wallet first so we never leave a vehicle without one.
    let wallet: WalletKeys;
    if (manualWallets) {
      const w = manualWallets[v.vehicleCode];
      if (!w?.id || !w.inkey || !w.adminkey) {
        console.error(`SEED_WALLETS_JSON has no complete entry for ${v.vehicleCode}`);
        process.exit(1);
      }
      wallet = w;
    } else {
      try {
        wallet = await createLnbitsWallet(env.LNBITS_URL, `Nauli ${v.vehicleCode}`);
      } catch (e) {
        console.error(`Wallet creation failed for ${v.vehicleCode}: ${(e as Error).message}`);
        printManualWalletInstructions(env.LNBITS_URL);
        process.exit(1);
      }
    }

    const { data: vehicle, error: vErr } = await db
      .from("vehicles")
      .insert({
        sacco_id: saccoId,
        owner_id: ownerIds[v.ownerKey],
        vehicle_code: v.vehicleCode,
        route_name: v.routeName,
        conductor_name: v.conductorName,
        preset_fare_kes: v.presetFareKes,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;
    const vehicleId = vehicle.id as string;

    const { error: wErr } = await db.from("vehicle_wallets").insert({
      vehicle_id: vehicleId,
      lnbits_wallet_id: wallet.id,
      lnbits_invoice_key: wallet.inkey,
      lnbits_admin_key: wallet.adminkey,
    });
    if (wErr) throw wErr;

    const history = buildHistory(vehicleId, v, btcKes, satsPerKes);
    await insertInBatches(db, history);
    const kes = history.reduce((s, r) => s + r.amount_kes, 0);
    console.log(
      `VEHICLE ${v.vehicleCode}  id=${vehicleId}  wallet=${wallet.id}  history=${history.length} tx / KES ${kes.toLocaleString()}`,
    );
  }

  const { count, error: cErr } = await db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("source", "seed");
  if (cErr) throw cErr;
  console.log(`\nDone. Seeded transactions in DB: ${count}`);
  console.log(`SACCO view: /sacco/${saccoId}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
