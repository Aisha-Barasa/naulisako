import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

// Conductor confirms they checked the passenger's codes. Only paid fares can be verified.
// No auth (demo); see README.

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .update({ verified_by_conductor: true, verified_at: new Date().toISOString() })
    .eq("id", id.data)
    .in("status", ["fulfilled", "settled"])
    .select("id, verified_by_conductor, verified_at");
  if (error) return NextResponse.json({ error: "Could not verify" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Not found or not paid yet" }, { status: 409 });
  return NextResponse.json(data[0]);
}
