import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { executePayout, PayoutError, previewPayout } from "@/lib/server/payout";

// Off-ramp. PIN-guarded. preview → show amount; pay → re-check and pay.

const base = { saccoId: z.string().uuid(), vehicleCode: z.string().trim().min(3).max(12) };
const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    ...base,
    destination: z.string().trim().min(5).max(2000),
    amountSats: z.number().int().min(1).max(10_000_000).optional(),
  }),
  z.object({
    action: z.literal("pay"),
    ...base,
    bolt11: z.string().trim().min(10).max(2000),
    destination: z.string().trim().min(5).max(2000),
    provider: z.enum(["tando", "bitcoin.co.ke", "other"]),
  }),
]);

export async function POST(req: Request) {
  if (!adminSessionOk(req.headers.get("x-admin-pin"))) return NextResponse.json({ error: "PIN required" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const b = parsed.data;
    if (b.action === "preview") return NextResponse.json(await previewPayout(b));
    return NextResponse.json(await executePayout(b));
  } catch (e) {
    if (e instanceof PayoutError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("payout failed", e);
    return NextResponse.json({ error: "Payout failed. Nothing was sent unless it shows as paid below." }, { status: 500 });
  }
}
