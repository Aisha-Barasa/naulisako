import { NextResponse } from "next/server";
import { parseCallback } from "@/lib/server/daraja";
import { applyStkOutcome } from "@/lib/server/payments";

// Daraja STK callback. Path avoids "mpesa"/"safaricom" (Daraja rejects those URLs).
// Always answer Accepted so Daraja doesn't retry; do the work only for a valid token.

const ACCEPTED = { ResultCode: 0, ResultDesc: "Accepted" };

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.DARAJA_CALLBACK_TOKEN;
  if (!expected || token !== expected) {
    console.warn("payment-result: bad or missing token; ignored");
    return NextResponse.json(ACCEPTED);
  }

  try {
    const cb = parseCallback(await req.json());
    const result = await applyStkOutcome({
      checkoutRequestId: cb.checkoutRequestId,
      resultCode: cb.resultCode,
      resultDesc: cb.resultDesc,
      receipt: cb.receipt,
    });
    if (!result.txId) console.warn(`payment-result: no tx for CheckoutRequestID ${cb.checkoutRequestId}`);
  } catch (e) {
    console.error("payment-result: failed to process callback", e);
  }
  return NextResponse.json(ACCEPTED);
}
