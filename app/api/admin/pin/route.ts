import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, adminCookieValue, pinAllowed } from "@/lib/server/admin-pin";

// Trade the demo PIN for a cookie (12h). Not real auth; see README.

export async function POST(req: Request) {
  const parsed = z.object({ pin: z.string().min(1).max(64) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || !pinAllowed(parsed.data.pin)) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminCookieValue(parsed.data.pin), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
  return res;
}
