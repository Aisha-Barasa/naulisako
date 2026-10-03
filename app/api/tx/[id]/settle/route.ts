import { NextResponse } from "next/server";
import { z } from "zod";
import { pinAllowed } from "@/lib/server/admin-pin";
import { settleTransaction } from "@/lib/server/treasury";

// Manual settlement retry (e.g. after topping up a low treasury). PIN-guarded.

const body = z.object({ pin: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  const pin = req.headers.get("x-admin-pin") ?? (parsed.success ? parsed.data.pin : undefined);
  if (!pinAllowed(pin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await settleTransaction(id.data);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    console.error(`settle ${id.data} failed`, e);
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}
