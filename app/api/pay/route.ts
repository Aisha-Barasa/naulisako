import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { DarajaError, stkPush } from "@/lib/server/daraja";
import { InvalidPhoneError, maskPhone, normalizeKePhone, phoneLast3 } from "@/lib/phone";

const payBody = z.object({
  vehicleCode: z.string().trim().min(1).max(20),
  amountKes: z.number().int().min(1).max(5000),
  phone: z.string().trim().min(9).max(20),
});

export async function POST(req: Request) {
  const parsed = payBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const vehicleCode = parsed.data.vehicleCode.replace(/\s+/g, "").toUpperCase();
  const { amountKes } = parsed.data;

  let phone: string;
  try {
    phone = normalizeKePhone(parsed.data.phone);
  } catch (e) {
    if (e instanceof InvalidPhoneError) {
      return NextResponse.json({ error: "Enter a valid Safaricom number, e.g. 0712 345 678" }, { status: 400 });
    }
    throw e;
  }

  const db = getSupabaseAdmin();
  const { data: vehicle, error: vErr } = await db
    .from("vehicles")
    .select("id, vehicle_code")
    .eq("vehicle_code", vehicleCode)
    .maybeSingle<{ id: string; vehicle_code: string }>();
  if (vErr) {
    console.error("pay: vehicle lookup failed", vErr);
    return NextResponse.json({ error: "Could not look up vehicle" }, { status: 500 });
  }
  if (!vehicle) return NextResponse.json({ error: `Unknown vehicle ${vehicleCode}` }, { status: 404 });

  let stk: Awaited<ReturnType<typeof stkPush>>;
  try {
    stk = await stkPush({ phone, amount: amountKes, accountRef: vehicle.vehicle_code, desc: "Nauli fare" });
  } catch (e) {
    const message = e instanceof DarajaError ? e.message : "M-Pesa is not responding";
    console.error("pay: STK push failed", e);
    return NextResponse.json({ error: `M-Pesa request failed: ${message}` }, { status: 502 });
  }

  const { data: tx, error: insErr } = await db
    .from("transactions")
    .insert({
      vehicle_id: vehicle.id,
      amount_kes: amountKes,
      payer_phone_masked: maskPhone(phone),
      phone_last3: phoneLast3(phone),
      daraja_checkout_id: stk.checkoutRequestId,
      daraja_merchant_request_id: stk.merchantRequestId,
      status: "processing",
      source: "pwa",
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr || !tx) {
    // The prompt is already on the phone; log enough to reconcile by hand.
    console.error(`pay: STK sent but insert failed. CheckoutRequestID=${stk.checkoutRequestId}`, insErr);
    return NextResponse.json({ error: "Payment started but could not be recorded" }, { status: 500 });
  }

  return NextResponse.json({ txId: tx.id, checkoutRequestId: stk.checkoutRequestId });
}
