import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { parseCallback } from "@/lib/server/daraja";
import { applyStkOutcome, type TxStatus } from "@/lib/server/payments";

// Demo safety net: fake a successful Daraja callback for a tx.
// Open in dev; in production only with DEMO_ADMIN_PIN.

const body = z.object({ txId: z.string().uuid(), pin: z.string().optional() });

function allowed(pin: string | undefined): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.DEMO_ADMIN_PIN;
  return Boolean(expected) && pin === expected;
}

function fakeReceipt(): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "SIM";
  for (let i = 0; i < 7; i++) s += A[randomInt(A.length)];
  return s;
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { txId, pin? }" }, { status: 400 });
  if (!allowed(parsed.data.pin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseAdmin();
  const { data: tx, error } = await db
    .from("transactions")
    .select("id, status, amount_kes, daraja_checkout_id, daraja_merchant_request_id")
    .eq("id", parsed.data.txId)
    .maybeSingle<{
      id: string;
      status: TxStatus;
      amount_kes: number;
      daraja_checkout_id: string | null;
      daraja_merchant_request_id: string | null;
    }>();
  if (error) return NextResponse.json({ error: "Could not load transaction" }, { status: 500 });
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (!tx.daraja_checkout_id) return NextResponse.json({ error: "Transaction has no CheckoutRequestID" }, { status: 409 });
  if (tx.status !== "processing") {
    return NextResponse.json({ error: `Transaction is already ${tx.status}`, status: tx.status }, { status: 409 });
  }

  const receipt = fakeReceipt();
  // Same shape Daraja sends, run through the same parser and state machine.
  const cb = parseCallback({
    Body: {
      stkCallback: {
        MerchantRequestID: tx.daraja_merchant_request_id ?? "SIM",
        CheckoutRequestID: tx.daraja_checkout_id,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully. (simulated)",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: tx.amount_kes },
            { Name: "MpesaReceiptNumber", Value: receipt },
            { Name: "TransactionDate", Value: 0 },
          ],
        },
      },
    },
  });
  const result = await applyStkOutcome({
    checkoutRequestId: cb.checkoutRequestId,
    resultCode: cb.resultCode,
    resultDesc: cb.resultDesc,
    receipt: cb.receipt,
  });

  return NextResponse.json({ txId: tx.id, status: result.status, receipt });
}
