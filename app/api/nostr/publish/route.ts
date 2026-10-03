import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionOk } from "@/lib/server/admin-pin";
import { nairobiDate, NostrError, publishDailyReport, type DailyReport } from "@/lib/server/nostr";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

// Publish the day's signed report for every vehicle in a SACCO. PIN-guarded.

const body = z.object({
  saccoId: z.string().uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!adminSessionOk(req.headers.get("x-admin-pin"))) return NextResponse.json({ error: "PIN required" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { saccoId, date? }" }, { status: 400 });
  const date = parsed.data.date ?? nairobiDate();
  if (date > nairobiDate()) return NextResponse.json({ error: "Can't publish a future day" }, { status: 400 });

  const { data: vehicles, error } = await getSupabaseAdmin()
    .from("vehicles")
    .select("vehicle_code")
    .eq("sacco_id", parsed.data.saccoId)
    .order("vehicle_code")
    .returns<{ vehicle_code: string }[]>();
  if (error) return NextResponse.json({ error: "Could not load vehicles" }, { status: 500 });
  if (!vehicles?.length) return NextResponse.json({ error: "No vehicles in this SACCO" }, { status: 404 });

  const reports: DailyReport[] = [];
  const failures: { vehicleCode: string; error: string }[] = [];
  for (const v of vehicles) {
    try {
      reports.push(await publishDailyReport(v.vehicle_code, date));
    } catch (e) {
      console.error(`nostr publish ${v.vehicle_code} ${date} failed`, e);
      failures.push({ vehicleCode: v.vehicle_code, error: e instanceof NostrError ? e.message : "Publish failed" });
    }
  }
  return NextResponse.json({ date, reports, failures }, { status: reports.length ? 200 : 502 });
}
