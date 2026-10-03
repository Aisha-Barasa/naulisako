import { z } from "zod";

// LNbits wallet API. All calls authenticate with a wallet key in X-Api-Key.
// Balances come back in msats; invoice amounts are in sats.

export class LnbitsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LnbitsError";
  }
}

function baseUrl(): string {
  const url = process.env.LNBITS_URL;
  if (!url) throw new LnbitsError("server is missing LNBITS_URL");
  return url.replace(/\/$/, "");
}

type CallInit = {
  method?: string;
  body?: unknown;
  /** Retries on network errors. Only safe where repeating the request can't move money twice. */
  retries?: number;
};

async function call(path: string, key: string, init: CallInit = {}): Promise<unknown> {
  const retries = init.retries ?? 2;
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${baseUrl()}${path}`, {
        method: init.method ?? "GET",
        headers: { "X-Api-Key": key, "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      break;
    } catch (e) {
      if (attempt >= retries) throw new LnbitsError(`LNbits unreachable: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  if (!res) throw new LnbitsError("LNbits unreachable");
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    // leave json null; reported below if the status is an error
  }
  if (!res.ok) {
    const detail = z.object({ detail: z.unknown() }).safeParse(json);
    const msg = detail.success ? JSON.stringify(detail.data.detail) : text.slice(0, 200);
    throw new LnbitsError(`LNbits ${init.method ?? "GET"} ${path} failed (${res.status}): ${msg}`, res.status);
  }
  return json;
}

const invoiceResponse = z
  .object({ payment_hash: z.string(), payment_request: z.string().optional(), bolt11: z.string().optional() })
  .passthrough();

export async function createInvoice(
  invoiceKey: string,
  sats: number,
  memo: string,
): Promise<{ paymentHash: string; bolt11: string }> {
  const json = invoiceResponse.parse(await call("/api/v1/payments", invoiceKey, { method: "POST", body: { out: false, amount: sats, memo } }));
  // Older LNbits names it payment_request, newer bolt11.
  const bolt11 = json.bolt11 ?? json.payment_request;
  if (!bolt11) throw new LnbitsError("LNbits invoice response has no bolt11/payment_request");
  return { paymentHash: json.payment_hash, bolt11 };
}

export async function payInvoice(adminKey: string, bolt11: string): Promise<{ paymentHash: string }> {
  const json = z
    .object({ payment_hash: z.string() })
    .passthrough()
    .parse(await call("/api/v1/payments", adminKey, { method: "POST", body: { out: true, bolt11 }, retries: 0 }));
  return { paymentHash: json.payment_hash };
}

/** Wallet balance in sats. */
export async function getBalance(key: string): Promise<number> {
  const json = z.object({ balance: z.number() }).passthrough().parse(await call("/api/v1/wallet", key));
  return Math.floor(json.balance / 1000);
}

const paymentStatus = z
  .object({
    paid: z.boolean(),
    status: z.string().optional(),
    details: z.object({ bolt11: z.string().optional(), status: z.string().optional() }).passthrough().nullish(),
  })
  .passthrough();

/** A payment on this key's wallet by hash. Unknown hash → not paid, no bolt11. */
export async function getPayment(
  key: string,
  paymentHash: string,
): Promise<{ paid: boolean; failed: boolean; bolt11: string | null }> {
  try {
    const json = paymentStatus.parse(await call(`/api/v1/payments/${paymentHash}`, key));
    const status = (json.status ?? json.details?.status ?? "").toLowerCase();
    return { paid: json.paid, failed: status === "failed", bolt11: json.details?.bolt11 ?? null };
  } catch (e) {
    if (e instanceof LnbitsError && e.status === 404) return { paid: false, failed: false, bolt11: null };
    throw e;
  }
}

const decodedInvoice = z
  .object({
    payment_hash: z.string(),
    amount_msat: z.number().optional(),
    description: z.string().optional(),
    expiry: z.number().optional(),
    date: z.number().optional(),
  })
  .passthrough();

export type DecodedInvoice = { paymentHash: string; amountSats: number | null; description: string | null };

export async function decodeInvoice(key: string, bolt11: string): Promise<DecodedInvoice> {
  const json = decodedInvoice.parse(await call("/api/v1/payments/decode", key, { method: "POST", body: { data: bolt11 } }));
  return {
    paymentHash: json.payment_hash,
    amountSats: json.amount_msat !== undefined ? Math.floor(json.amount_msat / 1000) : null,
    description: json.description ?? null,
  };
}
