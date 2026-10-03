import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — server code only (app/api/**, lib/server/**).
let admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next 14 caches server fetch() by default; DB reads must always be live.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return admin;
}
