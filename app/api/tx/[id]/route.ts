import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { TX_PUBLIC_COLUMNS, toTxPublic, type TxRowLike } from "@/lib/tx-public";

// Polling fallback for the passenger status page.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select(TX_PUBLIC_COLUMNS)
    .eq("id", id.data)
    .maybeSingle<TxRowLike>();
  if (error) return NextResponse.json({ error: "Could not load transaction" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  return NextResponse.json(toTxPublic(data), { headers: { "Cache-Control": "no-store" } });
}
