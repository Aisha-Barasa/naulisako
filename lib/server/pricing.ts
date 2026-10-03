// KES ↔ sats. CoinGecko doesn't quote KES, so: Yadio, then LNbits' own rate
// endpoint, then BTC_KES_FALLBACK. Cached for 60s.

const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;

let cache: { btcKes: number; at: number } | null = null;

function positive(n: unknown): number | null {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function fromLnbits(): Promise<number | null> {
  const base = process.env.LNBITS_URL?.replace(/\/$/, "");
  if (!base) return null;
  const res = await fetch(`${base}/api/v1/rate/KES`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = (await res.json()) as { price?: unknown };
  return positive(json.price);
}

async function fromYadio(): Promise<number | null> {
  const res = await fetch("https://api.yadio.io/exrates/BTC", { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = (await res.json()) as { BTC?: Record<string, unknown> };
  return positive(json.BTC?.KES);
}

/** KES per 1 BTC. */
export async function getBtcKes(): Promise<number> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.btcKes;
  for (const source of [fromYadio, fromLnbits]) {
    try {
      const v = await source();
      if (v) {
        cache = { btcKes: v, at: Date.now() };
        return v;
      }
    } catch {
      // try the next source
    }
  }
  const fallback = positive(process.env.BTC_KES_FALLBACK) ?? 13_000_000;
  console.warn(`pricing: live BTC/KES unavailable, using fallback ${fallback}`);
  return fallback;
}

/** sats for a KES amount, plus the KES-per-BTC rate used (stored on the tx). */
export async function kesToSats(kes: number): Promise<{ sats: number; rate: number }> {
  const demo = positive(process.env.DEMO_SATS_PER_KES);
  if (demo) return { sats: Math.max(1, Math.round(kes * demo)), rate: 1e8 / demo };
  const rate = await getBtcKes();
  return { sats: Math.max(1, Math.round((kes / rate) * 1e8)), rate };
}
