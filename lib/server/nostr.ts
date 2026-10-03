import { createHash } from "node:crypto";
import { neventEncode, npubEncode } from "nostr-tools/nip19";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { getSupabaseAdmin } from "./supabase-admin";

// Signed daily summary per vehicle, published to public Nostr relays.
// Anyone can recompute content_hash from the fare list to check the SACCO's
// numbers weren't changed later. Kind 30078 (parameterised replaceable, keyed
// by the "d" tag) so re-publishing the same vehicle + day replaces the event.

const KIND = 30078;
const PUBLISH_WAIT_MS = 8_000;
const EAT_OFFSET_MS = 3 * 3600_000;

export class NostrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NostrError";
  }
}

function secretKey(): Uint8Array {
  const hex = process.env.NOSTR_SECRET_KEY_HEX;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new NostrError("server is missing NOSTR_SECRET_KEY_HEX");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function relays(): string[] {
  return (process.env.NOSTR_RELAYS || "wss://relay.damus.io,wss://nos.lol")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("wss://"));
}

/** Nairobi calendar date (YYYY-MM-DD) → UTC [start, end) bounds. */
function dayBounds(date: string): { from: string; to: string } {
  const start = Date.parse(`${date}T00:00:00Z`) - EAT_OFFSET_MS;
  return { from: new Date(start).toISOString(), to: new Date(start + 24 * 3600_000).toISOString() };
}

export function nairobiDate(d: Date = new Date()): string {
  return new Date(d.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

export type DailyReport = {
  vehicleCode: string;
  date: string;
  fares: number;
  kes: number;
  sats: number;
  contentHash: string;
  eventId: string;
  nevent: string;
  njumpUrl: string;
  relaysOk: string[];
  relaysFailed: string[];
};

type FareRow = { id: string; amount_kes: number; amount_sats: number | null; receipt_last3: string | null; status: string };

export async function publishDailyReport(vehicleCode: string, date: string): Promise<DailyReport> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new NostrError("date must be YYYY-MM-DD");
  const db = getSupabaseAdmin();

  const { data: vehicle, error: vErr } = await db
    .from("vehicles")
    .select("id, vehicle_code, saccos(name)")
    .eq("vehicle_code", vehicleCode)
    .maybeSingle<{ id: string; vehicle_code: string; saccos: { name: string } | null }>();
  if (vErr) throw vErr;
  if (!vehicle) throw new NostrError(`Unknown vehicle ${vehicleCode}`);

  // All of the day's paid fares (PostgREST pages at 1000 rows).
  const { from, to } = dayBounds(date);
  const rows: FareRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("transactions")
      .select("id, amount_kes, amount_sats, receipt_last3, status")
      .eq("vehicle_id", vehicle.id)
      .in("status", ["fulfilled", "settled"])
      .gte("created_at", from)
      .lt("created_at", to)
      .order("id")
      .range(offset, offset + 999)
      .returns<FareRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // Canonical list: sorted by id, fixed field order. Phone digits are not included.
  const list = rows.map((r) => [r.id, r.amount_kes, r.receipt_last3 ?? "", r.status] as const);
  const contentHash = createHash("sha256").update(JSON.stringify(list)).digest("hex");
  const kes = rows.reduce((s, r) => s + r.amount_kes, 0);
  const sats = rows.reduce((s, r) => s + (r.status === "settled" ? r.amount_sats ?? 0 : 0), 0);
  const saccoName = vehicle.saccos?.name ?? "Nauli SaKo";

  const sk = secretKey();
  const event = finalizeEvent(
    {
      kind: KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", `${vehicle.vehicle_code}:${date}`],
        ["t", "naulisacco"],
        ["sacco", saccoName],
        ["hash", contentHash],
      ],
      content: `Nauli SaKo | ${vehicle.vehicle_code} | ${date} | ${rows.length} fares | KES ${kes.toLocaleString("en-KE")} | ${sats.toLocaleString("en-KE")} sats | hash ${contentHash}`,
    },
    sk,
  );

  const urls = relays();
  if (!urls.length) throw new NostrError("No relays configured (NOSTR_RELAYS)");
  const pool = new SimplePool();
  let results: PromiseSettledResult<string>[];
  try {
    results = await Promise.allSettled(pool.publish(urls, event, { maxWait: PUBLISH_WAIT_MS }));
  } finally {
    pool.close(urls);
  }
  const relaysOk = urls.filter((_, i) => results[i].status === "fulfilled");
  const relaysFailed = urls.filter((_, i) => results[i].status === "rejected");
  if (!relaysOk.length) throw new NostrError("No relay accepted the report. Check the connection and try again.");

  const { error: upErr } = await db
    .from("nostr_reports")
    .upsert(
      { vehicle_id: vehicle.id, report_date: date, event_id: event.id, content_hash: contentHash },
      { onConflict: "vehicle_id,report_date" },
    );
  if (upErr) throw upErr;

  const nevent = neventEncode({ id: event.id, relays: relaysOk, author: getPublicKey(sk), kind: KIND });
  return {
    vehicleCode: vehicle.vehicle_code,
    date,
    fares: rows.length,
    kes,
    sats,
    contentHash,
    eventId: event.id,
    nevent,
    njumpUrl: `https://njump.me/${nevent}`,
    relaysOk,
    relaysFailed,
  };
}

/** Public key of the signing key, as npub (safe to show). */
export function reporterNpub(): string | null {
  try {
    return npubEncode(getPublicKey(secretKey()));
  } catch {
    return null;
  }
}
