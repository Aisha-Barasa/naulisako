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
    return NextResponse.json(
      { error: "Choose a fare between KES 1 and 5,000 and enter your M-Pesa number.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
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
    return NextResponse.json({ error: "We couldn't reach our server just now. No money was taken. Try again." }, { status: 500 });
  }
  if (!vehicle) return NextResponse.json({ error: `We can't find vehicle ${vehicleCode}. Check the code under the QR sticker.` }, { status: 404 });

  let stk: Awaited<ReturnType<typeof stkPush>>;
  try {
    stk = await stkPush({ phone, amount: amountKes, accountRef: vehicle.vehicle_code, desc: "Nauli fare" });
  } catch (e) {
    // Log Daraja's detail for us; show the passenger what to do.
    console.error("pay: STK push failed", e instanceof DarajaError ? `${e.status} ${e.code} ${e.message}` : e);
    return NextResponse.json(
      { error: "M-Pesa didn't respond, so no prompt was sent and no money was taken. Wait a moment and try again." },
      { status: 502 },
    );
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
    return NextResponse.json(
      {
        error:
          "The M-Pesa prompt was sent but we couldn't record it. If you paid, tell the conductor the last 3 characters of your M-Pesa receipt.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ txId: tx.id, checkoutRequestId: stk.checkoutRequestId });
}
