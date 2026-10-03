import { z } from "zod";

// Lightning address (user@domain) → BOLT11 invoice via LNURL-pay (LUD-06/16).

export class LnurlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LnurlError";
  }
}

const ADDRESS = /^([a-z0-9._+-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i;

export function isLightningAddress(s: string): boolean {
  return ADDRESS.test(s);
}

const payRequest = z.object({
  tag: z.literal("payRequest"),
  callback: z.string().url(),
  minSendable: z.number(),
  maxSendable: z.number(),
});
const lnurlError = z.object({ status: z.literal("ERROR"), reason: z.string() });
const invoiceResponse = z.object({ pr: z.string() });

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new LnurlError(`Could not reach ${new URL(url).host}: ${(e as Error).message}`);
  }
  const json = (await res.json().catch(() => null)) as unknown;
  const err = lnurlError.safeParse(json);
  if (err.success) throw new LnurlError(err.data.reason);
  if (!res.ok || json === null) throw new LnurlError(`${new URL(url).host} answered ${res.status}`);
  return json;
}

/** Resolve a Lightning address to an invoice for `sats`. The caller must still check the invoice amount. */
export async function resolveLightningAddress(address: string, sats: number): Promise<{ bolt11: string; minSats: number; maxSats: number }> {
  const m = ADDRESS.exec(address.trim());
  if (!m) throw new LnurlError("Not a Lightning address (expected name@domain)");
  const [, user, domain] = m;
  if (/^(localhost|[\d.]+)$/i.test(domain)) throw new LnurlError("Lightning address domain not allowed");

  const meta = payRequest.safeParse(await getJson(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user.toLowerCase())}`));
  if (!meta.success) throw new LnurlError(`${domain} did not return a valid Lightning address response`);
  const minSats = Math.ceil(meta.data.minSendable / 1000);
  const maxSats = Math.floor(meta.data.maxSendable / 1000);
  if (sats < minSats || sats > maxSats) throw new LnurlError(`${address} accepts ${minSats.toLocaleString()}–${maxSats.toLocaleString()} sats`);

  const cb = new URL(meta.data.callback);
  cb.searchParams.set("amount", String(sats * 1000));
  const inv = invoiceResponse.safeParse(await getJson(cb.toString()));
  if (!inv.success) throw new LnurlError(`${domain} did not return an invoice`);
  return { bolt11: inv.data.pr, minSats, maxSats };
}
