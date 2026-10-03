import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { DarajaError, stkQuery } from "@/lib/server/daraja";
import { applyStkOutcome, type TxStatus } from "@/lib/server/payments";

// STK query fallback for when the sandbox callback never arrives.

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: tx, error } = await db
    .from("transactions")
    .select("id, status, daraja_checkout_id")
    .eq("id", id.data)
    .maybeSingle<{ id: string; status: TxStatus; daraja_checkout_id: string | null }>();
  if (error) return NextResponse.json({ error: "Could not load transaction" }, { status: 500 });
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  if (tx.status !== "processing" || !tx.daraja_checkout_id) {
    return NextResponse.json({ status: tx.status, pending: false });
  }

  try {
    const q = await stkQuery(tx.daraja_checkout_id);
    if (q.pending) return NextResponse.json({ status: "processing", pending: true });
    const result = await applyStkOutcome({
      checkoutRequestId: tx.daraja_checkout_id,
      resultCode: q.resultCode,
      resultDesc: q.resultDesc,
      receipt: null,
    });
    return NextResponse.json({ status: result.status, pending: false, resultDesc: q.resultDesc });
  } catch (e) {
    const message = e instanceof DarajaError ? e.message : "M-Pesa is not responding";
    console.error(`tx query ${tx.id} failed`, e);
    return NextResponse.json({ error: `Status check failed: ${message}`, status: tx.status }, { status: 502 });
  }
}
