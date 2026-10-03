import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { getSaccoForecast } from "@/lib/server/forecast";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { saccoId: string } }) {
  if (!adminSessionOk(req.headers.get("x-admin-pin"))) return NextResponse.json({ error: "PIN required" }, { status: 401 });
  const id = z.string().uuid().safeParse(params.saccoId);
  if (!id.success) return NextResponse.json({ error: "Invalid SACCO id" }, { status: 400 });
  try {
    const forecast = await getSaccoForecast(id.data);
    if (!forecast) return NextResponse.json({ error: "SACCO not found" }, { status: 404 });
    return NextResponse.json(forecast, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`forecast ${id.data} failed`, e);
    return NextResponse.json({ error: "Could not build forecast" }, { status: 500 });
  }
}
