import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { getSaccoSummary, type SummaryRange } from "@/lib/server/sacco-summary";

export const dynamic = "force-dynamic";

const rangeSchema = z.enum(["today", "yesterday", "7d"]).catch("today");

export async function GET(req: Request, { params }: { params: { saccoId: string } }) {
  if (!adminSessionOk(req.headers.get("x-admin-pin"))) return NextResponse.json({ error: "PIN required" }, { status: 401 });
  const id = z.string().uuid().safeParse(params.saccoId);
  if (!id.success) return NextResponse.json({ error: "Invalid SACCO id" }, { status: 400 });

  const range: SummaryRange = rangeSchema.parse(new URL(req.url).searchParams.get("range"));
  try {
    const summary = await getSaccoSummary(id.data, range);
    if (!summary) return NextResponse.json({ error: "SACCO not found" }, { status: 404 });
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`sacco summary ${id.data} failed`, e);
    return NextResponse.json({ error: "Could not load summary" }, { status: 500 });
  }
}
