import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { briefingEnabled, getBriefing } from "@/lib/server/briefing";
import { getSaccoForecast } from "@/lib/server/forecast";

// Separate from the page so the forecast renders instantly and Claude's latency only affects this box.

export async function POST(req: Request, { params }: { params: { saccoId: string } }) {
  if (!adminSessionOk(req.headers.get("x-admin-pin"))) return NextResponse.json({ error: "PIN required" }, { status: 401 });
  if (!briefingEnabled()) return NextResponse.json({ error: "AI summary not configured" }, { status: 404 });
  const id = z.string().uuid().safeParse(params.saccoId);
  if (!id.success) return NextResponse.json({ error: "Invalid SACCO id" }, { status: 400 });

  const forecast = await getSaccoForecast(id.data).catch(() => null);
  if (!forecast) return NextResponse.json({ error: "Forecast unavailable" }, { status: 404 });
  const text = await getBriefing(forecast);
  if (!text) return NextResponse.json({ error: "AI summary unavailable right now" }, { status: 502 });
  return NextResponse.json({ text });
}
