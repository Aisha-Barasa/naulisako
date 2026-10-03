import { z } from "zod";

// Daraja (M-Pesa) STK Push client. Server only.

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new DarajaError(`server is missing ${name}`);
  return v;
}

function baseUrl(): string {
  return (process.env.DARAJA_BASE_URL || "https://sandbox.safaricom.co.ke").replace(/\/$/, "");
}

export class DarajaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DarajaError";
  }
}

const errorBody = z.object({ errorCode: z.string().optional(), errorMessage: z.string().optional() }).passthrough();

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DarajaError(`Daraja ${res.status}: non-JSON response: ${text.slice(0, 200)}`, res.status);
  }
}

function toDarajaError(status: number, body: unknown): DarajaError {
  const parsed = errorBody.safeParse(body);
  const msg = parsed.success ? parsed.data.errorMessage : undefined;
  const code = parsed.success ? parsed.data.errorCode : undefined;
  return new DarajaError(msg ?? `Daraja request failed (${status})`, status, code);
}

// ---------- OAuth token ----------

let tokenCache: { token: string; expiresAt: number } | null = null;

const tokenResponse = z.object({ access_token: z.string(), expires_in: z.union([z.string(), z.number()]) });

export async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const basic = Buffer.from(`${env("DARAJA_CONSUMER_KEY")}:${env("DARAJA_CONSUMER_SECRET")}`).toString("base64");
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await readJson(res);
  if (!res.ok) throw toDarajaError(res.status, body);

  const parsed = tokenResponse.safeParse(body);
  if (!parsed.success) throw new DarajaError("Daraja token response missing access_token", res.status);

  // Tokens last ~1h; refresh after ~50 min.
  const ttlMs = Math.min(Number(parsed.data.expires_in) * 1000 - 10 * 60_000, 50 * 60_000);
  tokenCache = { token: parsed.data.access_token, expiresAt: Date.now() + Math.max(ttlMs, 60_000) };
  return tokenCache.token;
}

// ---------- password / timestamp ----------

/** YYYYMMDDHHmmss in Africa/Nairobi time (Daraja rejects UTC timestamps). */
export function nairobiTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(shortcode + passkey + timestamp).toString("base64");
}

async function postJson(path: string, payload: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const token = await getToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, body: await readJson(res) };
}

// ---------- STK push ----------

export type StkPushInput = { phone: string; amount: number; accountRef: string; desc: string };
export type StkPushResult = { checkoutRequestId: string; merchantRequestId: string; customerMessage: string };

const stkPushResponse = z.object({
  MerchantRequestID: z.string(),
  CheckoutRequestID: z.string(),
  ResponseCode: z.string(),
  ResponseDescription: z.string().optional(),
  CustomerMessage: z.string().optional(),
});

export function callbackUrl(): string {
  const base = env("DARAJA_CALLBACK_BASE_URL").replace(/\/$/, "");
  return `${base}/api/hooks/payment-result?token=${encodeURIComponent(env("DARAJA_CALLBACK_TOKEN"))}`;
}

export async function stkPush({ phone, amount, accountRef, desc }: StkPushInput): Promise<StkPushResult> {
  if (!Number.isInteger(amount) || amount < 1) throw new DarajaError("Amount must be a positive integer");

  const shortcode = env("DARAJA_SHORTCODE");
  const timestamp = nairobiTimestamp();
  const { status, body } = await postJson("/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: shortcode,
    Password: stkPassword(shortcode, env("DARAJA_PASSKEY"), timestamp),
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl(),
    AccountReference: accountRef.slice(0, 12),
    TransactionDesc: desc.slice(0, 13),
  });

  const parsed = stkPushResponse.safeParse(body);
  if (status >= 400 || !parsed.success) throw toDarajaError(status, body);
  if (parsed.data.ResponseCode !== "0") {
    throw new DarajaError(parsed.data.ResponseDescription ?? "STK push rejected", status, parsed.data.ResponseCode);
  }
  return {
    checkoutRequestId: parsed.data.CheckoutRequestID,
    merchantRequestId: parsed.data.MerchantRequestID,
    customerMessage: parsed.data.CustomerMessage ?? "",
  };
}

// ---------- STK query ----------

/** pending = Daraja hasn't got a final answer yet (user still on the PIN prompt). */
export type StkQueryResult = { pending: true } | { pending: false; resultCode: number; resultDesc: string };

const stkQueryResponse = z.object({
  ResponseCode: z.string(),
  ResultCode: z.union([z.string(), z.number()]).optional(),
  ResultDesc: z.string().optional(),
});

// Daraja answers "still processing" with HTTP 500 and this code.
const STILL_PROCESSING = "500.001.1001";

export async function stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
  const shortcode = env("DARAJA_SHORTCODE");
  const timestamp = nairobiTimestamp();
  const { status, body } = await postJson("/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: shortcode,
    Password: stkPassword(shortcode, env("DARAJA_PASSKEY"), timestamp),
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  });

  const err = errorBody.safeParse(body);
  if (err.success && err.data.errorCode === STILL_PROCESSING) return { pending: true };

  const parsed = stkQueryResponse.safeParse(body);
  if (status >= 400 || !parsed.success || parsed.data.ResultCode === undefined) throw toDarajaError(status, body);
  return {
    pending: false,
    resultCode: Number(parsed.data.ResultCode),
    resultDesc: parsed.data.ResultDesc ?? "",
  };
}

// ---------- callback ----------

const callbackItem = z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() });

const callbackBody = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.union([z.number(), z.string()]),
      ResultDesc: z.string(),
      CallbackMetadata: z.object({ Item: z.array(callbackItem) }).optional(),
    }),
  }),
});

export type ParsedCallback = {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  resultDesc: string;
  receipt: string | null;
  amount: number | null;
  /** Full payer number from Daraja. Never store or log this. */
  phone: string | null;
};

export function parseCallback(body: unknown): ParsedCallback {
  const cb = callbackBody.parse(body).Body.stkCallback;
  const items = cb.CallbackMetadata?.Item ?? [];
  const item = (name: string) => items.find((i) => i.Name === name)?.Value;
  const resultCode = Number(cb.ResultCode);
  const receipt = item("MpesaReceiptNumber");
  const amount = item("Amount");
  const phone = item("PhoneNumber");
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    merchantRequestId: cb.MerchantRequestID,
    resultCode,
    resultDesc: cb.ResultDesc,
    receipt: resultCode === 0 && receipt !== undefined ? String(receipt) : null,
    amount: amount !== undefined ? Number(amount) : null,
    phone: phone !== undefined ? String(phone) : null,
  };
}
